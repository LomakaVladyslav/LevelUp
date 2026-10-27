import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required; use a dedicated test database');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'levelup-integration-test-secret-only';
process.env.NODE_ENV = 'test';
delete process.env.OPENAI_API_KEY;
const app = require('../src/index').default as Express;
// dotenv may load optional local values; no external AI calls in integration tests.
delete process.env.OPENAI_API_KEY;
const db = require('../src/utils/prisma').default as typeof import('../src/utils/prisma').default;
const userIds: string[] = [];
const achievementCode = `test-${crypto.randomUUID()}`;

async function account() {
  const id = crypto.randomUUID();
  const user = await db.user.create({ data: { id, email: `${id}@example.test`, username: `test-${id}`, passwordHash: 'unused' } });
  userIds.push(id);
  const token = jwt.sign({ userId: id, sessionVersion: 0 }, process.env.JWT_SECRET!);
  const auth = `Bearer ${token}`;
  return { user, auth };
}
const planBody = { type: 'STUDY', title: 'Read for 20 minutes', scheduleType: 'SIMPLE' };
async function plan(auth: string, extra = {}) {
  const response = await request(app).post('/api/planned-activities').set('Authorization', auth).send({ ...planBody, ...extra });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.plannedActivity;
}

before(async () => {
  await db.achievement.create({ data: { code: achievementCode, name: 'Test first activity', description: 'Test', condition: 'activities_count:1', xpReward: 60 } });
});
after(async () => {
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.achievement.deleteMany({ where: { code: achievementCode } });
  await db.$disconnect();
});

test('concurrent completions commit once and include achievement XP in final level', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth);
  await db.goal.create({ data: { userId: user.id, title: 'Study twice', type: 'STUDY', targetCount: 2 } });
  const results = await Promise.all(Array.from({ length: 8 }, () => request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth)));
  assert.equal(results.filter((response) => response.status === 201).length, 1);
  assert.equal(results.filter((response) => response.status === 409).length, 7);
  const success = results.find((response) => response.status === 201)!;
  assert.equal(success.body.levelUp, true);
  assert.equal(success.body.newLevel, 2);
  assert.equal(success.body.totalXp, 110);
  assert.equal(success.body.achievementXpGained, 60);
  assert.equal(await db.activity.count({ where: { userId: user.id } }), 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).xp, 110);
  assert.equal((await db.goal.findFirstOrThrow({ where: { userId: user.id } })).currentCount, 1);
  assert.equal(await db.xpHistory.count({ where: { userId: user.id } }), 2);
});

test('same idempotency key replays the exact result, including simultaneous requests', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth, { scheduleType: 'DAILY' });
  const key = crypto.randomUUID();
  const complete = () => request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth).set('Idempotency-Key', key);
  const [one, two] = await Promise.all([complete(), complete()]);
  assert.equal(one.status, 201); assert.equal(two.status, 201);
  assert.deepEqual(one.body, two.body);
  assert.equal(await db.activity.count({ where: { userId: user.id } }), 1);
  const conflict = await request(app).post('/api/planned-activities').set('Authorization', auth).set('Idempotency-Key', key).send(planBody);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.errorCode, 'IDEMPOTENCY_CONFLICT');
});

test('create and bulk create can be safely retried after a lost response', async () => {
  const { user, auth } = await account();
  for (const [path, body] of [['/api/planned-activities', planBody], ['/api/planned-activities/bulk', { activities: [planBody, planBody] }]] as const) {
    const key = crypto.randomUUID();
    const send = () => request(app).post(path).set('Authorization', auth).set('Idempotency-Key', key).send(body);
    const [a, b] = await Promise.all([send(), send()]);
    assert.equal(a.status, 201); assert.deepEqual(a.body, b.body);
  }
  assert.equal(await db.plannedActivity.count({ where: { userId: user.id } }), 3);
});

test('a failure after activity insertion rolls back the activity, plan, XP and receipt', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth);
  // Dedicated test DB only; generated UUID is not user input. Force a real database failure.
  await db.$executeRawUnsafe(`ALTER TABLE "XpHistory" ADD CONSTRAINT "integration_failure" CHECK ("userId" <> '${user.id}') NOT VALID`);
  const key = crypto.randomUUID();
  try {
    const response = await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth).set('Idempotency-Key', key);
    assert.equal(response.status, 500);
    assert.equal(await db.activity.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.mutationReceipt.count({ where: { userId: user.id } }), 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).xp, 0);
    assert.equal((await db.plannedActivity.findUniqueOrThrow({ where: { id: activity.id } })).status, 'ACTIVE');
  } finally { await db.$executeRaw`ALTER TABLE "XpHistory" DROP CONSTRAINT "integration_failure"`; }
  const retry = await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth).set('Idempotency-Key', key);
  assert.equal(retry.status, 201);
});

test('parallel different activities preserve XP, level, one streak day and one achievement reward', async () => {
  const { user, auth } = await account();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => request(app).post('/api/activities').set('Authorization', auth).send({ type: 'CUSTOM', title: `Task ${i}` })));
  assert.ok(results.every((response) => response.status === 201));
  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.xp, 6 * 30 + 60);
  assert.equal(stored.level, 2);
  assert.equal(await db.userAchievement.count({ where: { userId: user.id } }), 1);
  assert.equal((await db.streak.findFirstOrThrow({ where: { userId: user.id } })).currentCount, 1);
  assert.equal((await db.xpHistory.aggregate({ where: { userId: user.id }, _sum: { amount: true } }))._sum.amount, stored.xp);
});

test('stale edits cannot overwrite a newer plan or reopen a completed plan', async () => {
  const { auth } = await account();
  const activity = await plan(auth);
  const first = await request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', auth).send({ title: 'New title', updatedAt: activity.updatedAt });
  assert.equal(first.status, 200);
  const stale = await request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', auth).send({ title: 'Stale title', updatedAt: activity.updatedAt });
  assert.equal(stale.status, 409);
  await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth);
  const reopen = await request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', auth).send({ status: 'ACTIVE' });
  assert.equal(reopen.status, 409);
});

test('daily completion uses the planned timezone and cannot be repeated today', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth, { scheduleType: 'DAILY', timezone: 'Pacific/Kiritimati' });
  const first = await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth).set('X-Timezone', 'Pacific/Kiritimati');
  assert.equal(first.status, 201);
  const { dateKeyInTimezone } = require('../src/services/planned-activity-metrics.service');
  assert.equal(first.body.activity.completedForDate.slice(0, 10), dateKeyInTimezone(new Date(), 'Pacific/Kiritimati'));
  const second = await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth);
  assert.equal(second.status, 409);
  const listed = await request(app).get('/api/planned-activities').set('Authorization', auth);
  assert.equal(listed.body.plannedActivities[0].isCompletedToday, true);
  assert.equal(listed.body.todayProgress.percentage, 100);
  assert.equal(await db.activity.count({ where: { userId: user.id } }), 1);
});

test('paused daily habits can be listed and resumed without losing history', async () => {
  const { auth } = await account();
  const activity = await plan(auth, { scheduleType: 'DAILY' });
  const paused = await request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', auth).send({ status: 'DISABLED' });
  assert.equal(paused.status, 200);
  assert.equal((await request(app).get('/api/planned-activities').set('Authorization', auth)).body.plannedActivities.length, 0);
  assert.equal((await request(app).get('/api/planned-activities?includeInactive=true').set('Authorization', auth)).body.plannedActivities[0].status, 'DISABLED');
  assert.equal((await request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', auth).send({ status: 'ACTIVE' })).status, 200);
});

test('foreign accounts cannot mutate or complete another account plan', async () => {
  const first = await account(); const second = await account();
  const activity = await plan(first.auth);
  assert.equal((await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', second.auth)).status, 404);
  assert.equal((await request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', second.auth).send({ title: 'Changed' })).status, 404);
  await request(app).delete(`/api/planned-activities/${activity.id}`).set('Authorization', second.auth);
  assert.ok(await db.plannedActivity.findUnique({ where: { id: activity.id } }));
});

test('invalid dates, fields and pagination are rejected without writes', async () => {
  const { user, auth } = await account();
  for (const extra of [{ title: ' ' }, { title: 'x'.repeat(201) }, { description: {} }, { scheduleType: 'DATE', dueDate: '2026-02-30' }, { scheduleType: 'DATE' }, { dueTimeMinutes: true }, { timezone: 'invalid' }]) {
    const response = await request(app).post('/api/planned-activities').set('Authorization', auth).send({ ...planBody, ...extra });
    assert.equal(response.status, 400, JSON.stringify(extra));
  }
  for (const query of ['page=-1', 'limit=100000', 'page=1x', 'limit=0']) assert.equal((await request(app).get(`/api/activities?${query}`).set('Authorization', auth)).status, 400);
  assert.equal(await db.plannedActivity.count({ where: { userId: user.id } }), 0);
});

test('password reset token is single use under concurrency and revokes prior sessions', async () => {
  const { user, auth } = await account();
  const token = crypto.randomBytes(32).toString('hex');
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
  const responses = await Promise.all(['new-password-1', 'new-password-2'].map((password) => request(app).post('/api/auth/reset-password').send({ token, password })));
  assert.deepEqual(responses.map((result) => result.status).sort(), [200, 400]);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', auth)).status, 401);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);
});

test('archiving completion preserves audit/rewards and prevents daily re-awarding', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth, { scheduleType: 'DAILY' });
  const done = await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth);
  assert.equal((await request(app).delete(`/api/activities/${done.body.activity.id}`).set('Authorization', auth)).status, 200);
  assert.equal((await request(app).get('/api/activities').set('Authorization', auth)).body.activities.length, 0);
  assert.equal((await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth)).status, 409);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).xp, done.body.totalXp);
});

test('expired streak is displayed as zero and weekly stats respect the requested local date', async () => {
  const { user, auth } = await account();
  await db.streak.create({ data: { userId: user.id, currentCount: 5, longestCount: 8, lastActivityDate: new Date(Date.now() - 4 * 86400000) } });
  assert.equal((await request(app).get('/api/stats/overview').set('Authorization', auth)).body.streak.current, 0);
  const weekly = await request(app).get('/api/stats/weekly').set('Authorization', auth).set('X-Timezone', 'America/Los_Angeles');
  assert.equal(weekly.status, 200); assert.equal(weekly.body.chartData.length, 7);
  const { dateKeyInTimezone } = require('../src/services/planned-activity-metrics.service');
  assert.equal(weekly.body.chartData[6].date, dateKeyInTimezone(new Date(), 'America/Los_Angeles'));
});

test('malformed JSON gets a JSON error and health checks database connectivity', async () => {
  const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{');
  assert.equal(malformed.status, 400); assert.equal(malformed.type, 'application/json');
  assert.equal((await request(app).get('/health')).status, 200);
});

test('weekly progress includes activity and achievement XP exactly once after a retry', async () => {
  const { auth } = await account();
  const activity = await plan(auth);
  const key = crypto.randomUUID();
  const complete = () => request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth).set('Idempotency-Key', key);
  const result = await complete();
  assert.equal(result.status, 201);
  assert.equal(result.body.achievementXpGained, 60);
  assert.deepEqual((await complete()).body, result.body);
  const weekly = await request(app).get('/api/stats/weekly').set('Authorization', auth).set('X-Timezone', 'Pacific/Kiritimati');
  assert.equal(weekly.status, 200);
  assert.equal(weekly.body.chartData.reduce((sum: number, day: { xpEarned: number }) => sum + day.xpEarned, 0), result.body.totalXp);
  assert.equal(weekly.body.chartData.reduce((sum: number, day: { count: number }) => sum + day.count, 0), 1);
  const overview = await request(app).get('/api/stats/overview').set('Authorization', auth);
  assert.equal(overview.body.user.totalXp, result.body.totalXp);
  const recommendations = await request(app).get('/api/recommendations').set('Authorization', auth);
  assert.equal(recommendations.status, 200);
  assert.equal(recommendations.body.recommendations.some((item: { code: string }) => ['START_TODAY', 'MAINTAIN_STREAK'].includes(item.code)), false);
});

test('a late achievement write failure rolls back activity XP, streak and goal progress', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth);
  const goal = await db.goal.create({ data: { userId: user.id, title: 'One session', type: 'STUDY', targetCount: 1 } });
  await db.$executeRawUnsafe(`ALTER TABLE "UserAchievement" ADD CONSTRAINT "integration_late_failure" CHECK ("userId" <> '${user.id}') NOT VALID`);
  try {
    const response = await request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth);
    assert.equal(response.status, 500);
    assert.equal(await db.activity.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.xpHistory.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.streak.count({ where: { userId: user.id } }), 0);
    assert.equal((await db.goal.findUniqueOrThrow({ where: { id: goal.id } })).currentCount, 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).xp, 0);
  } finally { await db.$executeRaw`ALTER TABLE "UserAchievement" DROP CONSTRAINT "integration_late_failure"`; }
});

test('receipt insertion failure rolls back the entire completion and retry can succeed', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth);
  const key = crypto.randomUUID();
  await db.$executeRawUnsafe(`ALTER TABLE "MutationReceipt" ADD CONSTRAINT "integration_receipt_failure" CHECK ("userId" <> '${user.id}') NOT VALID`);
  const send = () => request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth).set('Idempotency-Key', key);
  try {
    assert.equal((await send()).status, 500);
    assert.equal(await db.activity.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.userAchievement.count({ where: { userId: user.id } }), 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).xp, 0);
  } finally { await db.$executeRaw`ALTER TABLE "MutationReceipt" DROP CONSTRAINT "integration_receipt_failure"`; }
  assert.equal((await send()).status, 201);
});

test('authorization is rechecked under the write lock after session revocation', async () => {
  const { user } = await account();
  await db.user.update({ where: { id: user.id }, data: { sessionVersion: 1 } });
  const { runMutation } = require('../src/services/user-mutation.service');
  let wrote = false;
  const previouslyAuthenticatedRequest = {
    user: { id: user.id, sessionVersion: 0 }, method: 'POST', originalUrl: '/api/activities', body: {}, get: () => undefined,
  };
  await assert.rejects(runMutation(previouslyAuthenticatedRequest, async () => { wrote = true; return {}; }), { status: 401 });
  assert.equal(wrote, false);
});

test('concurrent plan edit and completion cannot produce mixed activity fields', async () => {
  const { user, auth } = await account();
  const activity = await plan(auth);
  const [edit, completion] = await Promise.all([
    request(app).patch(`/api/planned-activities/${activity.id}`).set('Authorization', auth).send({ type: 'HABIT', title: 'Take a break', updatedAt: activity.updatedAt }),
    request(app).post(`/api/planned-activities/${activity.id}/complete`).set('Authorization', auth),
  ]);
  assert.equal(completion.status, 201);
  assert.ok([200, 409].includes(edit.status));
  const stored = await db.activity.findFirstOrThrow({ where: { userId: user.id } });
  assert.deepEqual([stored.type, stored.title], edit.status === 200 ? ['HABIT', 'Take a break'] : ['STUDY', planBody.title]);
});

test('avatars are stored in PostgreSQL, replaced atomically and removed with the account', async () => {
  const { user, auth } = await account();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lxkAAAAASUVORK5CYII=', 'base64');
  const upload = () => request(app).post('/api/auth/me/avatar').set('Authorization', auth).attach('avatar', png, { filename: 'avatar.png', contentType: 'image/png' });
  const first = await upload();
  assert.equal(first.status, 200);
  const url = first.body.user.avatarUrl;
  assert.ok(url.startsWith('/api/avatars/'));
  const downloaded = await request(app).get(url);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers['content-type'], 'image/png');
  assert.deepEqual(downloaded.body, png);
  const second = await upload();
  assert.equal(second.status, 200);
  assert.notEqual(second.body.user.avatarUrl, url);
  assert.equal(await db.avatar.count({ where: { userId: user.id } }), 1);
  assert.equal((await request(app).get(url)).status, 404);
  await request(app).delete('/api/auth/me').set('Authorization', auth);
  assert.equal((await request(app).get(second.body.user.avatarUrl)).status, 404);
});

test('fake images and oversized avatars are rejected before changing a profile', async () => {
  const { user, auth } = await account();
  const fake = await request(app).post('/api/auth/me/avatar').set('Authorization', auth).attach('avatar', Buffer.from('<svg onload="alert(1)"></svg>'), { filename: 'fake.png', contentType: 'image/png' });
  assert.equal(fake.status, 400);
  const large = await request(app).post('/api/auth/me/avatar').set('Authorization', auth).attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' });
  assert.equal(large.status, 400);
  assert.equal(await db.avatar.count({ where: { userId: user.id } }), 0);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).avatarUrl, null);
});

test('terminating a PostgreSQL connection during completion rolls back every write', async () => {
  const { user, auth } = await account();
  const planned = await plan(auth);
  const { withUserLock } = await import('../src/services/user-mutation.service');
  const { completeActivity } = await import('../src/services/completion.service');
  await assert.rejects(withUserLock(user.id, async (tx) => {
    await completeActivity(tx, { userId: user.id, plannedActivityId: planned.id, locale: 'en', timezone: 'UTC' });
    const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    await db.$queryRaw`SELECT pg_terminate_backend(${connection.pid}::integer)`;
    // Force the transaction to observe its terminated socket, before COMMIT.
    await tx.$queryRaw`SELECT 1`;
  }));
  assert.equal(await db.activity.count({ where: { userId: user.id } }), 0);
  assert.equal(await db.xpHistory.count({ where: { userId: user.id } }), 0);
  assert.equal(await db.userAchievement.count({ where: { userId: user.id } }), 0);
  assert.equal(await db.streak.count({ where: { userId: user.id } }), 0);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).xp, 0);
  assert.equal((await db.plannedActivity.findUniqueOrThrow({ where: { id: planned.id } })).status, 'ACTIVE');
  const retry = await request(app).post(`/api/planned-activities/${planned.id}/complete`).set('Authorization', auth).set('Idempotency-Key', crypto.randomUUID());
  assert.equal(retry.status, 201);
  assert.equal(await db.activity.count({ where: { userId: user.id } }), 1);
});

test('a delayed completion for a previous day cannot complete the new day', async () => {
  const { user, auth } = await account();
  const planned = await plan(auth, { scheduleType: 'DAILY', timezone: 'UTC' });
  const response = await request(app).post(`/api/planned-activities/${planned.id}/complete`).set('Authorization', auth).send({ completionDate: '2000-01-01' });
  assert.equal(response.status, 409);
  assert.equal(response.body.errorCode, 'ACTIVITY_CHANGED');
  assert.equal(await db.activity.count({ where: { userId: user.id } }), 0);
  const today = new Date().toISOString().slice(0, 10);
  const retry = await request(app).post(`/api/planned-activities/${planned.id}/complete`).set('Authorization', auth).send({ completionDate: today });
  assert.equal(retry.status, 201);
});
