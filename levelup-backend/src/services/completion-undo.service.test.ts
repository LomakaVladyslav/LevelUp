import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { replayProgress, undoCompletion, goalProgressAfterUndo } from './completion-undo.service';
const item = (id: string, day: string, xpEarned = 30) => ({ id, type: 'CUSTOM', xpEarned, completedAt: new Date(`${day}T08:00:00Z`), completedForDate: new Date(day), streakDate: new Date(day) });
const awards = [
  { id: 'first', code: 'first', condition: 'activities_count:1', xpReward: 60 },
  { id: 'level', code: 'level', condition: 'xp_reached:100', xpReward: 20 },
  { id: 'streak', code: 'streak', condition: 'streak_days:3', xpReward: 10 },
];
test('undo replay removes rewards without remaining supporting evidence', () => {
  const before = replayProgress([item('a', '2026-10-19'), item('b', '2026-10-20')], awards);
  assert.equal(before.metrics.totalXp, 140);
  const after = replayProgress([item('a', '2026-10-19')], awards);
  assert.equal(after.metrics.totalXp, 90);
  assert.equal(after.metrics.level, 1);
  assert.deepEqual([...after.unlocked.keys()], ['first']);
  assert.equal(replayProgress([], awards).metrics.totalXp, 0);
});
test('achievement rewards cannot self-sustain after their qualifying completion is undone', () => {
  assert.equal(replayProgress([item('a', '2026-10-19')], [{ id: 'x', code: 'x', condition: 'xp_reached:100', xpReward: 100 }]).unlocked.size, 0);
});
test('undo middle completion rebuilds current and longest global streak deterministically', () => {
  const history = [item('a', '2026-10-19'), item('b', '2026-10-20'), item('c', '2026-10-21')];
  assert.equal(replayProgress(history, awards).unlocked.has('streak'), true);
  const state = replayProgress(history.filter((a) => a.id !== 'b'), awards);
  assert.equal(state.metrics.streakDays, 1);
  assert.equal(state.longestCount, 1);
  assert.equal(state.unlocked.has('streak'), false);
});
test('global streak replays each completion timezone date and tolerates timezone travel backwards', () => {
  const a = item('a', '2026-10-19');
  const b = { ...item('b', '2026-10-20'), streakDate: new Date('2026-10-18') };
  const c = { ...item('c', '2026-10-21'), streakDate: new Date('2026-10-20') };
  assert.equal(replayProgress([a, b, c], []).metrics.streakDays, 2);
});
test('unrelated XP and other completion bonuses remain unchanged after undo', () => {
  const state = replayProgress([item('b', '2026-10-20', 47)], [], 12);
  assert.equal(state.metrics.totalXp, 59);
});
test('achievement replay does not depend on database result order', () => {
  const history = [item('a', '2026-10-19'), item('b', '2026-10-20')];
  assert.deepEqual(replayProgress([...history].reverse(), [...awards].reverse()), replayProgress(history, awards));
});

function database() {
  const state = { activity: { ...item('a', '2026-10-19'), userId: 'owner', plannedActivityId: 'plan', goalContributions: [{ id: 'goal', version: 0, amount: 1 }] } as any,
    tombstone: null as any, xp: 90, level: 1, planStatus: 'COMPLETED', goal: { id: 'goal', currentCount: 1, targetCount: 1, progressVersion: 0, progressBaseCount: 0 },
    awards: ['first'], xpRows: [{ amount: 30, reason: 'activity_completed' }, { amount: 60, reason: 'achievement_unlocked' }], streak: null as any };
  const db = {
    completionUndo: { findUnique: async () => state.tombstone, create: async ({ data }: any) => { state.tombstone = data; } },
    activity: { findFirst: async ({ where }: any) => state.activity?.userId === where.userId ? state.activity : null, delete: async () => { state.activity = null; }, findMany: async () => state.activity ? [state.activity] : [] },
    plannedActivity: { updateMany: async () => { state.planStatus = 'ACTIVE'; } },
    xpHistory: { create: async ({ data }: any) => { state.xpRows.push(data); }, aggregate: async () => ({ _sum: { amount: 0 } }), deleteMany: async () => { state.xpRows = state.xpRows.filter((r) => r.reason !== 'achievement_unlocked'); } },
    goal: { findFirst: async ({ where }: any) => state.goal.progressVersion === where.progressVersion ? state.goal : null, update: async ({ data }: any) => { Object.assign(state.goal, data); } },
    achievement: { findMany: async () => awards },
    userAchievement: { deleteMany: async () => { state.awards = []; }, create: async ({ data }: any) => { state.awards.push(data.achievementId); } },
    user: { update: async ({ data }: any) => { state.xp = data.xp; state.level = data.level; }, findUniqueOrThrow: async () => ({ xp: state.xp, level: state.level }) },
    streak: { upsert: async ({ update }: any) => { state.streak = update; } },
  } as unknown as Prisma.TransactionClient;
  return { db, state };
}
test('undo removes the exact completion, reopens plan, compensates XP, goals, streak and awards', async () => {
  const { db, state } = database();
  const result = await undoCompletion(db, 'owner', 'a');
  assert.equal(result.totalXp, 0);
  assert.equal(state.activity, null);
  assert.equal(state.planStatus, 'ACTIVE');
  assert.equal(state.goal.currentCount, 0);
  assert.equal(state.streak.currentCount, 0);
  assert.deepEqual(state.awards, []);
  assert.equal(state.xpRows.reduce((sum, row) => sum + row.amount, 0), 0);
});
test('duplicate undo without a receipt is a no-op and cannot undo a later recompletion', async () => {
  const { db, state } = database();
  await undoCompletion(db, 'owner', 'a');
  state.activity = { ...item('new', '2026-10-19'), userId: 'owner' };
  state.xp = 30;
  const again = await undoCompletion(db, 'owner', 'a');
  assert.equal(again.totalXp, 30);
  assert.equal(state.activity.id, 'new');
  assert.equal(state.xpRows.filter((r) => r.reason === 'activity_undo').length, 1);
});
test('foreign and invalid completion ids never mutate user progress', async () => {
  const { db, state } = database();
  await assert.rejects(undoCompletion(db, 'other', 'a'), { status: 404 });
  assert.equal(state.xp, 90);
  state.activity = null;
  await assert.rejects(undoCompletion(db, 'owner', 'missing'), { status: 404 });
});
test('another account cannot replay an undo tombstone', async () => {
  const { db } = database();
  await undoCompletion(db, 'owner', 'a');
  await assert.rejects(undoCompletion(db, 'other', 'a'), { status: 404 });
});
test('a subsequent manual goal edit is preserved by undo', async () => {
  const { db, state } = database();
  state.goal.progressVersion = 1;
  await undoCompletion(db, 'owner', 'a');
  assert.equal(state.goal.currentCount, 1);
});

test('undo preserves a completed goal when later qualifying completions still satisfy it', () => {
  const goal = { id: 'g', progressVersion: 0, progressBaseCount: 0, targetCount: 2 };
  const contribution = { id: 'g', version: 0, amount: 1 };
  assert.equal(goalProgressAfterUndo(goal, [contribution, contribution, contribution]), 2);
  assert.equal(goalProgressAfterUndo(goal, [contribution]), 1);
  assert.equal(goalProgressAfterUndo({ ...goal, progressBaseCount: 1 }, [contribution]), 2);
  assert.equal(goalProgressAfterUndo({ ...goal, progressVersion: 1 }, [contribution]), 0);
});
