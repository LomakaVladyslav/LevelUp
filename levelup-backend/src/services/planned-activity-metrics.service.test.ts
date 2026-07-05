import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateActivityStreak,
  calculateTodayProgress,
  PlannedActivityCompletionInput,
  PlannedActivityMetricInput,
} from './planned-activity-metrics.service';

test('activity streak is zero without recent completions', () => {
  assert.equal(calculateActivityStreak([], '2026-06-08'), 0);
  assert.equal(
    calculateActivityStreak(['2026-06-05'], '2026-06-08'),
    0,
  );
});

test('activity streak includes a completion today', () => {
  assert.equal(
    calculateActivityStreak(
      ['2026-06-06', '2026-06-07', '2026-06-08'],
      '2026-06-08',
    ),
    3,
  );
});

test('activity streak remains active when the latest completion was yesterday', () => {
  assert.equal(
    calculateActivityStreak(
      ['2026-06-05', '2026-06-06', '2026-06-07'],
      '2026-06-08',
    ),
    3,
  );
});

test('activity streak stops at the first missing calendar day', () => {
  assert.equal(
    calculateActivityStreak(
      ['2026-06-03', '2026-06-05', '2026-06-06', '2026-06-07'],
      '2026-06-08',
    ),
    3,
  );
});

const now = new Date('2026-06-08T00:30:00.000Z');

const activity = (
  overrides: Partial<PlannedActivityMetricInput> & { id: string },
): PlannedActivityMetricInput => ({
  id: overrides.id,
  scheduleType: overrides.scheduleType ?? 'DAILY',
  status: overrides.status ?? 'ACTIVE',
  dueDate: overrides.dueDate ?? null,
  timezone: overrides.timezone ?? 'UTC',
});

const completion = (
  plannedActivityId: string,
  dateKey: string,
): PlannedActivityCompletionInput => ({
  plannedActivityId,
  completedForDate: new Date(`${dateKey}T00:00:00.000Z`),
});

test('today progress includes daily and date activities due today', () => {
  const result = calculateTodayProgress(
    [
      activity({ id: 'daily' }),
      activity({
        id: 'date',
        scheduleType: 'DATE',
        dueDate: new Date('2026-06-08T00:00:00.000Z'),
      }),
    ],
    [completion('daily', '2026-06-08')],
    now,
  );

  assert.deepEqual(result, { completed: 1, total: 2, percentage: 50 });
});

test('completed date activities remain in today progress', () => {
  const result = calculateTodayProgress(
    [
      activity({
        id: 'date',
        scheduleType: 'DATE',
        status: 'COMPLETED',
        dueDate: new Date('2026-06-08T00:00:00.000Z'),
      }),
    ],
    [completion('date', '2026-06-08')],
    now,
  );

  assert.deepEqual(result, { completed: 1, total: 1, percentage: 100 });
});

test('today progress excludes simple, future, and disabled activities', () => {
  const result = calculateTodayProgress(
    [
      activity({ id: 'simple', scheduleType: 'SIMPLE' }),
      activity({
        id: 'future',
        scheduleType: 'DATE',
        dueDate: new Date('2026-06-09T00:00:00.000Z'),
      }),
      activity({ id: 'disabled', status: 'DISABLED' }),
    ],
    [],
    now,
  );

  assert.deepEqual(result, { completed: 0, total: 0, percentage: 0 });
});

test('today progress respects each activity timezone', () => {
  const result = calculateTodayProgress(
    [
      activity({
        id: 'los-angeles',
        scheduleType: 'DATE',
        dueDate: new Date('2026-06-07T00:00:00.000Z'),
        timezone: 'America/Los_Angeles',
      }),
      activity({
        id: 'kyiv',
        scheduleType: 'DATE',
        dueDate: new Date('2026-06-08T00:00:00.000Z'),
        timezone: 'Europe/Kyiv',
      }),
    ],
    [
      completion('los-angeles', '2026-06-07'),
      completion('kyiv', '2026-06-08'),
    ],
    now,
  );

  assert.deepEqual(result, { completed: 2, total: 2, percentage: 100 });
});

test('today progress uses local date boundaries instead of UTC boundaries', () => {
  const result = calculateTodayProgress(
    [
      activity({
        id: 'tokyo',
        scheduleType: 'DATE',
        dueDate: new Date('2026-06-08T00:00:00.000Z'),
        timezone: 'Asia/Tokyo',
      }),
      activity({
        id: 'new-york',
        scheduleType: 'DATE',
        dueDate: new Date('2026-06-07T00:00:00.000Z'),
        timezone: 'America/New_York',
      }),
    ],
    [
      completion('tokyo', '2026-06-08'),
      completion('new-york', '2026-06-07'),
    ],
    new Date('2026-06-07T23:30:00.000Z'),
  );

  assert.deepEqual(result, { completed: 2, total: 2, percentage: 100 });
});
