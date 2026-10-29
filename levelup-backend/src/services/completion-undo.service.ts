import { Prisma } from '@prisma/client';
import { HttpError } from '../utils/http-error';
import { levelFromXp } from '../utils/constants';
import { isAchievementConditionMet, AchievementMetrics } from './achievement.service';
import { shiftDate } from './recurrence.service';

type HistoryItem = { id: string; type: string; xpEarned: number; completedAt: Date; streakDate: Date | null; completedForDate: Date | null };
type Award = { id: string; code: string; condition: string; xpReward: number };

// Replay remaining evidence in completion order. Rewards use a least fixed point:
// an achievement cannot remain unlocked solely because its own XP satisfies it.
// XP already awarded to OTHER completions is immutable (no retroactive bonus edits).
export function replayProgress(history: HistoryItem[], awards: Award[], otherXp = 0) {
  const metrics: AchievementMetrics = { totalActivities: 0, activityCounts: {}, streakDays: 0, level: levelFromXp(otherXp), totalXp: otherXp };
  const unlocked = new Map<string, Date>();
  let longestCount = 0;
  let lastDate: string | null = null;
  for (const item of [...history].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.id.localeCompare(b.id))) {
    const day = (item.streakDate ?? item.completedForDate ?? item.completedAt).toISOString().slice(0, 10);
    if (!lastDate || day > lastDate) {
      metrics.streakDays = lastDate && shiftDate(lastDate, 1) === day ? metrics.streakDays + 1 : 1;
      lastDate = day;
      longestCount = Math.max(longestCount, metrics.streakDays);
    }
    metrics.totalActivities++;
    metrics.activityCounts[item.type] = (metrics.activityCounts[item.type] ?? 0) + 1;
    metrics.totalXp += item.xpEarned;
    metrics.level = levelFromXp(metrics.totalXp);
    let changed: boolean;
    do {
      changed = false;
      for (const award of [...awards].sort((a, b) => a.code.localeCompare(b.code))) {
        if (unlocked.has(award.id) || !isAchievementConditionMet(award.condition, metrics)) continue;
        unlocked.set(award.id, item.completedAt);
        metrics.totalXp += award.xpReward;
        metrics.level = levelFromXp(metrics.totalXp);
        changed = true;
      }
    } while (changed);
  }
  return { metrics, unlocked, longestCount, lastActivityDate: lastDate ? new Date(`${lastDate}T00:00:00Z`) : null };
}

type GoalContribution = { id: string; version: number; amount: number };
export function goalProgressAfterUndo(goal: { id: string; progressVersion: number; progressBaseCount: number; targetCount: number }, remaining: GoalContribution[]) {
  return Math.min(goal.targetCount, goal.progressBaseCount + remaining.filter((item) => item.id === goal.id && item.version === goal.progressVersion).reduce((sum, item) => sum + item.amount, 0));
}

// Caller owns runMutation's user row lock, transaction, authorization and receipt.
export async function undoCompletion(db: Prisma.TransactionClient, userId: string, activityId: string) {
  const tombstone = await db.completionUndo.findUnique({ where: { activityId } });
  if (tombstone && tombstone.userId !== userId) throw new HttpError(404, 'Completion not found', 'NOT_FOUND');
  if (!tombstone) {
    const activity = await db.activity.findFirst({ where: { id: activityId, userId } });
    if (!activity) throw new HttpError(404, 'Completion not found', 'NOT_FOUND');
    await db.completionUndo.create({ data: { activityId, userId } });
    await db.activity.delete({ where: { id: activityId } });
    if (activity.plannedActivityId) await db.plannedActivity.updateMany({
      where: { id: activity.plannedActivityId, userId, status: 'COMPLETED' }, data: { status: 'ACTIVE', completedAt: null },
    });
    // Backdate the compensation so the original day's chart also rolls back.
    await db.xpHistory.create({ data: { userId, amount: -activity.xpEarned, reason: 'activity_undo', createdAt: activity.completedAt } });
    const [history, awards, other] = await Promise.all([
      db.activity.findMany({ where: { userId }, orderBy: [{ completedAt: 'asc' }, { id: 'asc' }] }),
      db.achievement.findMany(),
      db.xpHistory.aggregate({ where: { userId, reason: { not: 'achievement_unlocked' } }, _sum: { amount: true } }),
    ]);
    const contributions = activity.goalContributions as GoalContribution[];
    for (const contribution of contributions) {
      const goal = await db.goal.findFirst({ where: { id: contribution.id, userId, progressVersion: contribution.version } });
      if (!goal) continue; // A later manual edit owns the progress now.
      const currentCount = goalProgressAfterUndo(goal, history.flatMap((item) => item.goalContributions as GoalContribution[]));
      await db.goal.update({ where: { id: goal.id }, data: { currentCount, isCompleted: currentCount >= goal.targetCount } });
    }
    // Preserve non-achievement ledger XP without surviving Activity evidence
    // (for example legacy history deleted before archiving was introduced).
    const baselineXp = (other._sum.amount ?? 0) - history.reduce((sum, item) => sum + item.xpEarned, 0);
    const state = replayProgress(history, awards, baselineXp);
    await db.userAchievement.deleteMany({ where: { userId } });
    await db.xpHistory.deleteMany({ where: { userId, reason: 'achievement_unlocked' } });
    for (const award of awards) {
      const unlockedAt = state.unlocked.get(award.id);
      if (!unlockedAt) continue;
      await db.userAchievement.create({ data: { userId, achievementId: award.id, unlockedAt } });
      if (award.xpReward > 0) await db.xpHistory.create({ data: { userId, amount: award.xpReward, reason: 'achievement_unlocked', createdAt: unlockedAt } });
    }
    await db.user.update({ where: { id: userId }, data: { xp: state.metrics.totalXp, level: state.metrics.level } });
    const streak = { currentCount: state.metrics.streakDays, longestCount: state.longestCount, lastActivityDate: state.lastActivityDate };
    await db.streak.upsert({ where: { userId_type: { userId, type: 'daily' } }, create: { userId, ...streak }, update: streak });
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, level: true } });
  return { activityId, undone: true, totalXp: user.xp, newLevel: user.level };
}
