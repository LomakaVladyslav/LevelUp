// Socket-free handler/service contract tests. Real PostgreSQL concurrency lives in integration/.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import '../middleware/auth.middleware';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { createPlannedActivity, updatePlannedActivity } from './planned-activity.controller';
import { completeActivity } from '../services/completion.service';
import { runMutation } from '../services/user-mutation.service';
import prisma from '../utils/prisma';
import { calculateTodayProgress, dateKeyInTimezone } from '../services/planned-activity-metrics.service';
import { snapshot, shiftDate, scheduledOn } from '../services/recurrence.service';

const restores: Array<() => void> = [];
const stub = (object: any, key: string, fn: any) => { const previous = object[key]; object[key] = fn; restores.push(() => { object[key] = previous; }); };
afterEach(() => restores.splice(0).reverse().forEach(fn => fn()));
const req = (body: unknown, key?: string) => ({ user: { id: 'owner', sessionVersion: 0 }, body, params: { id: 'plan' }, method: 'POST', originalUrl: '/api/planned-activities', get: (name: string) => name === 'Idempotency-Key' ? key : undefined } as unknown as Request);
async function invoke(handler: (req: Request, res: Response) => Promise<void>, body: unknown) {
  let status = 200; let result: any;
  const res = { status: (code: number) => { status = code; return res; }, json: (data: unknown) => { result = data; return res; } } as Response;
  await handler(req(body), res);
  return { status, body: result };
}
function transaction(db: unknown) {
  stub(prisma, '$transaction', async (work: (db: unknown) => unknown) => work(db));
}
const lock = async () => [{ id: 'owner', sessionVersion: 0 }];
const plan = (extra = {}) => ({ id: 'plan', userId: 'owner', title: 'Read', type: 'CUSTOM', description: null, motivationText: null, scheduleType: 'DAILY', weekdays: [], scheduleHistory: [], status: 'ACTIVE', timezone: 'UTC', dueDate: null, dueTimeMinutes: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...extra });

test('title-only create and date-without-time go through the locked mutation handler', async () => {
  let locks = 0;
  transaction({ $queryRaw: async () => { locks++; return lock(); }, plannedActivity: { create: async ({ data }: any) => ({ ...plan(), ...data }) } });
  const simple = await invoke(createPlannedActivity, { title: '  Quick note  ' });
  assert.equal(simple.status, 201); assert.equal(simple.body.plannedActivity.type, 'CUSTOM');
  assert.equal(simple.body.plannedActivity.title, 'Quick note');
  assert.equal(simple.body.plannedActivity.scheduleType, 'SIMPLE');
  const date = await invoke(createPlannedActivity, { title: 'Appointment', dueDate: '2026-11-01' });
  assert.equal(date.status, 201); assert.equal(date.body.plannedActivity.scheduleType, 'DATE');
  assert.equal(date.body.plannedActivity.dueTimeMinutes, null); assert.equal(locks, 2);
});
test('invalid recurrence and time-only payloads are rejected before writes', async () => {
  transaction({ $queryRaw: () => { throw new Error('must not reach database'); } });
  for (const extra of [ { scheduleType: 'WEEKLY', weekdays: [] }, { scheduleType: 'WEEKLY', weekdays: [1, 1] }, { scheduleType: 'WEEKLY', weekdays: [7] }, { scheduleType: 'WEEKLY', weekdays: ['1'] }, { dueTimeMinutes: 30 }, { timezone: 'not-a-zone' } ]) {
    assert.equal((await invoke(createPlannedActivity, { title: 'Task', ...extra })).status, 400);
  }
});
test('weekly creation persists explicit local-date schedule revision', async () => {
  transaction({ $queryRaw: lock, plannedActivity: { create: async ({ data }: any) => data } });
  const result = await invoke(createPlannedActivity, { title: 'Walk', scheduleType: 'WEEKLY', weekdays: [1, 3, 5], timezone: 'Pacific/Kiritimati' });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body.plannedActivity.weekdays, [1, 3, 5]);
  assert.equal(result.body.plannedActivity.scheduleHistory[0].from, dateKeyInTimezone(new Date(), 'Pacific/Kiritimati'));
});
test('edit preserves the past and pause stops todays expected occurrence', async () => {
  const current = plan();
  transaction({ $queryRaw: lock, plannedActivity: { findFirst: async () => current, update: async ({ data }: any) => ({ ...current, ...data }) } });
  const edited = await invoke(updatePlannedActivity, { scheduleType: 'WEEKLY', weekdays: [1, 3, 5] });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.plannedActivity.scheduleHistory[0].scheduleType, 'DAILY');
  assert.ok(edited.body.plannedActivity.scheduleHistory[1].from > new Date().toISOString().slice(0, 10));
  const paused = await invoke(updatePlannedActivity, { status: 'DISABLED' });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.plannedActivity.scheduleHistory.at(-1).paused, true);
});
test('recurring completion validates timezone occurrence and optimistic version before XP writes', async () => {
  const today = new Date().getUTCDay();
  const db = (extra: any) => ({ user: { findUniqueOrThrow: async () => ({ xp: 0, level: 1 }) }, plannedActivity: { findFirst: async () => plan(extra) }, activity: { findFirst: async () => null } }) as unknown as Prisma.TransactionClient;
  const input = { userId: 'owner', locale: 'en' as const, timezone: 'UTC', plannedActivityId: 'plan' };
  await assert.rejects(completeActivity(db({}), { ...input, completionDate: '2000-01-01' }), { errorCode: 'ACTIVITY_CHANGED' });
  await assert.rejects(completeActivity(db({}), { ...input, expectedUpdatedAt: 'stale' }), { errorCode: 'ACTIVITY_CHANGED' });
  await assert.rejects(completeActivity(db({ scheduleType: 'WEEKLY', weekdays: [(today + 1) % 7] }), input), { errorCode: 'NOT_SCHEDULED' });
  await assert.rejects(completeActivity(db({ status: 'DISABLED' }), input), { errorCode: 'ACTIVITY_DISABLED' });
});
test('moving a dated task removes the old expected date immediately and records the new date', async () => {
  const today = dateKeyInTimezone(new Date(), 'UTC');
  const tomorrow = shiftDate(today, 1);
  const current = plan({ scheduleType: 'DATE', dueDate: new Date(today) });
  const existing = { ...current, scheduleHistory: [snapshot(current, '2026-01-01')] };
  transaction({ $queryRaw: lock, plannedActivity: { findFirst: async () => existing, update: async ({ data }: any) => ({ ...existing, ...data }) } });
  const result = await invoke(updatePlannedActivity, { dueDate: tomorrow });
  assert.equal(result.status, 200);
  const edited = result.body.plannedActivity;
  assert.equal(scheduledOn(edited, today), false);
  assert.equal(scheduledOn(edited, tomorrow), true);
  assert.equal(calculateTodayProgress([edited], [], new Date()).total, 0);
});
test('duplicate occurrence is rejected before awarding XP even with another request key', async () => {
  const db = { user: { findUniqueOrThrow: async () => ({ xp: 0, level: 1 }) }, plannedActivity: { findFirst: async () => plan() }, activity: { findFirst: async () => ({ id: 'existing' }) } } as unknown as Prisma.TransactionClient;
  await assert.rejects(completeActivity(db, { userId: 'owner', locale: 'en', timezone: 'UTC', plannedActivityId: 'plan' }), { errorCode: 'ACTIVITY_ALREADY_COMPLETED' });
});
test('mutation receipt replays only after the user lock and session check', async () => {
  let receipt: any = null; let calls = 0; const events: string[] = [];
  const db = { $queryRaw: async () => { events.push('lock'); return lock(); }, mutationReceipt: { findUnique: async () => { events.push('receipt'); return receipt; }, create: async ({ data }: any) => { receipt = data; } } };
  transaction(db);
  const input = req({ title: 'Task' }, 'same-request-key');
  assert.deepEqual(await runMutation(input, async () => { calls++; return { saved: true }; }), { saved: true });
  assert.deepEqual(await runMutation(input, async () => { calls++; return {}; }), { saved: true });
  assert.equal(calls, 1); assert.deepEqual(events, ['lock', 'receipt', 'lock', 'receipt']);
  await assert.rejects(runMutation(req({ title: 'Different' }, 'same-request-key'), async () => ({})), { errorCode: 'IDEMPOTENCY_CONFLICT' });
});
test('a completion receipt is revoked after Undo, while an Undo receipt remains replayable', async () => {
  let receipt: any = null;
  const db = { $queryRaw: lock, mutationReceipt: { findUnique: async () => receipt, create: async ({ data }: any) => { receipt = data; } }, completionUndo: { findUnique: async () => ({ activityId: 'a', userId: 'owner' }) } };
  transaction(db);
  const input = req({}, 'receipt-key');
  await runMutation(input, async () => ({ activity: { id: 'a' } }));
  await assert.rejects(runMutation(input, async () => ({})), { errorCode: 'COMPLETION_UNDONE' });
  receipt = null;
  await runMutation(input, async () => ({ activityId: 'a', undone: true }));
  assert.deepEqual(await runMutation(input, async () => ({})), { activityId: 'a', undone: true });
});
