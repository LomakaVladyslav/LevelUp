import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { ActivityType, PlannedActivityScheduleType } from '@prisma/client';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../index').default as Express;
const prisma = require('../utils/prisma').default as typeof import('../utils/prisma').default;
const adaptiveXpService = require('../services/adaptive-xp.service') as typeof import('../services/adaptive-xp.service');
const xpService = require('../services/xp.service') as typeof import('../services/xp.service');
const streakService = require('../services/streak.service') as typeof import('../services/streak.service');
const achievementService = require('../services/achievement.service') as typeof import('../services/achievement.service');

const restoreCallbacks: Array<() => void> = [];

const stubMethod = <T extends Record<string, unknown>>(
  target: T,
  methodName: keyof T,
  replacement: unknown,
) => {
  const original = target[methodName];
  (target as Record<string, unknown>)[methodName as string] = replacement;
  restoreCallbacks.push(() => {
    (target as Record<string, unknown>)[methodName as string] = original;
  });
};

const authHeader = () =>
  `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`;

const plannedActivity = (overrides: {
  id?: string;
  scheduleType?: PlannedActivityScheduleType;
  status?: 'ACTIVE' | 'COMPLETED' | 'DISABLED';
  dueDate?: Date | null;
} = {}) => ({
  id: overrides.id ?? 'planned-1',
  userId: 'user-1',
  type: 'STUDY' as ActivityType,
  title: 'Read TypeScript',
  description: null,
  motivationText: null,
  scheduleType: overrides.scheduleType ?? 'SIMPLE',
  dueDate: overrides.dueDate ?? null,
  dueTimeMinutes: null,
  timezone: 'UTC',
  status: overrides.status ?? 'ACTIVE',
  completedAt: null,
  disabledAt: null,
  createdAt: new Date('2026-06-24T08:00:00.000Z'),
  updatedAt: new Date('2026-06-24T08:00:00.000Z'),
  translations: [],
});

const completedActivity = {
  id: 'activity-1',
  userId: 'user-1',
  plannedActivityId: 'planned-1',
  completedForDate: new Date('2026-06-24T00:00:00.000Z'),
  type: 'STUDY' as ActivityType,
  title: 'Read TypeScript',
  description: null,
  xpEarned: 30,
  duration: null,
  completedAt: new Date('2026-06-24T09:00:00.000Z'),
  createdAt: new Date('2026-06-24T09:00:00.000Z'),
};

const xpBreakdown = {
  baseXp: 30,
  streakDays: 1,
  streakMultiplier: 1,
  streakBonus: 0,
  balanceMultiplier: 1,
  balanceBonus: 0,
  balanceApplied: false,
  comebackMultiplier: 1,
  comebackBonus: 0,
  comebackApplied: false,
  totalXp: 30,
};

afterEach(() => {
  for (const restore of restoreCallbacks.splice(0).reverse()) {
    restore();
  }
});

const mockTransactionPassthrough = () => {
  stubMethod(prisma as unknown as Record<string, unknown>, '$transaction', async (operation: unknown) => {
    if (typeof operation === 'function') {
      return operation(prisma);
    }

    return Promise.all(operation as Promise<unknown>[]);
  });
};

test('create planned activity rejects invalid payloads before hitting the database', async () => {
  const response = await request(app)
    .post('/api/planned-activities')
    .set('Authorization', authHeader())
    .send({ type: 'STUDY' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Title is required');
});

test('daily planned activity cannot be completed twice for the same local day', async () => {
  stubMethod(prisma.plannedActivity as unknown as Record<string, unknown>, 'findFirst', async () =>
    plannedActivity({ scheduleType: 'DAILY' }),
  );
  stubMethod(adaptiveXpService as unknown as Record<string, unknown>, 'calculateAdaptiveXp', async () => xpBreakdown);
  stubMethod(prisma.activity as unknown as Record<string, unknown>, 'findFirst', async () => completedActivity);
  mockTransactionPassthrough();

  const response = await request(app)
    .post('/api/planned-activities/planned-1/complete')
    .set('Authorization', authHeader())
    .send();

  assert.equal(response.status, 409);
  assert.equal(
    response.body.error,
    'This daily activity is already completed today',
  );
});

test('simple planned activity completion creates an activity and awards XP', async () => {
  stubMethod(prisma.plannedActivity as unknown as Record<string, unknown>, 'findFirst', async () =>
    plannedActivity({ scheduleType: 'SIMPLE' }),
  );
  stubMethod(adaptiveXpService as unknown as Record<string, unknown>, 'calculateAdaptiveXp', async () => xpBreakdown);
  stubMethod(prisma.activity as unknown as Record<string, unknown>, 'create', async () => completedActivity);
  stubMethod(prisma.plannedActivity as unknown as Record<string, unknown>, 'update', async () =>
    plannedActivity({ scheduleType: 'SIMPLE', status: 'COMPLETED' }),
  );
  stubMethod(prisma.activityTranslation as unknown as Record<string, unknown>, 'createMany', async () => ({ count: 0 }));
  stubMethod(xpService as unknown as Record<string, unknown>, 'awardXP', async () => ({
    xpGained: 30,
    levelUp: false,
    newLevel: 1,
  }));
  stubMethod(streakService as unknown as Record<string, unknown>, 'updateStreak', async () => ({
    currentCount: 1,
    longestCount: 1,
    isNewRecord: true,
  }));
  stubMethod(achievementService as unknown as Record<string, unknown>, 'checkAndUnlockAchievements', async () => []);
  stubMethod(prisma.activity as unknown as Record<string, unknown>, 'findUniqueOrThrow', async () => ({
    ...completedActivity,
    translations: [],
  }));
  mockTransactionPassthrough();

  const response = await request(app)
    .post('/api/planned-activities/planned-1/complete')
    .set('Authorization', authHeader())
    .send();

  assert.equal(response.status, 201);
  assert.equal(response.body.xpGained, 30);
  assert.equal(response.body.activity.id, completedActivity.id);
  assert.equal(response.body.activity.displayTitle, completedActivity.title);
});

test('already completed simple or date planned activities return conflict', async () => {
  stubMethod(prisma.plannedActivity as unknown as Record<string, unknown>, 'findFirst', async () =>
    plannedActivity({ scheduleType: 'DATE', status: 'COMPLETED' }),
  );

  const response = await request(app)
    .post('/api/planned-activities/planned-1/complete')
    .set('Authorization', authHeader())
    .send();

  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'This activity is already completed');
});
