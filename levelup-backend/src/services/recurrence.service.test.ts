import test from 'node:test';
import assert from 'node:assert/strict';
import { habitStreak, reviseSchedule, scheduledOn, scheduleForDate, RecurringPlan } from './recurrence.service';
import { calculateTodayProgress, dateKeyInTimezone } from './planned-activity-metrics.service';

const plan = (extra: Partial<RecurringPlan> = {}): RecurringPlan => ({ scheduleType: 'WEEKLY', weekdays: [1, 3, 5], status: 'ACTIVE', timezone: 'Europe/Kyiv', createdAt: new Date('2026-10-19T08:00:00Z'), ...extra });

test('daily and selected weekdays produce one scheduled date, never a backlog', () => {
  assert.equal(scheduledOn(plan(), '2026-10-19'), true);
  assert.equal(scheduledOn(plan(), '2026-10-20'), false);
  for (let day = 19; day <= 25; day++) assert.equal(scheduledOn(plan({ scheduleType: 'DAILY' }), `2026-10-${day}`), true);
  assert.equal(habitStreak(plan(), ['2026-10-19'], '2026-11-09'), 0);
});
test('weekday preset excludes both weekend days', () => {
  const weekdays = plan({ weekdays: [1, 2, 3, 4, 5] });
  assert.equal(scheduledOn(weekdays, '2026-10-23'), true);
  assert.equal(scheduledOn(weekdays, '2026-10-24'), false);
  assert.equal(scheduledOn(weekdays, '2026-10-25'), false);
});
test('habit streak follows scheduled executions and tolerates an incomplete today', () => {
  const dates = ['2026-10-19', '2026-10-21', '2026-10-23'];
  for (const today of ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']) assert.equal(habitStreak(plan(), dates, today), 3);
  assert.equal(habitStreak(plan(), dates, '2026-10-27'), 0);
  assert.equal(habitStreak(plan(), [...dates, '2026-10-28'], '2026-10-28'), 1);
});
test('schedule edits preserve historical expectations and start tomorrow', () => {
  const before = plan();
  const after = { ...before, weekdays: [2, 4] };
  const edited = { ...after, scheduleHistory: reviseSchedule(before, after, new Date('2026-10-21T09:00:00Z')) };
  assert.equal(scheduledOn(edited, '2026-10-21'), true);
  assert.equal(scheduledOn(edited, '2026-10-22'), true);
  assert.equal(scheduledOn(edited, '2026-10-23'), false);
  assert.equal(habitStreak(edited, ['2026-10-19', '2026-10-21', '2026-10-22'], '2026-10-25'), 3);
});
test('pause removes expectations immediately, resume starts tomorrow, streak survives', () => {
  const before = plan();
  const paused = { ...before, status: 'DISABLED', scheduleHistory: reviseSchedule(before, { ...before, status: 'DISABLED' }, new Date('2026-10-23T08:00:00Z')) };
  assert.equal(scheduledOn(paused, '2026-10-23'), false);
  assert.equal(habitStreak(paused, ['2026-10-19', '2026-10-21'], '2026-11-10'), 2);
  const resumed = { ...paused, status: 'ACTIVE', scheduleHistory: reviseSchedule(paused, { ...paused, status: 'ACTIVE' }, new Date('2026-11-10T08:00:00Z')) };
  assert.equal(scheduledOn(resumed, '2026-11-11'), true);
  assert.equal(habitStreak(resumed, ['2026-10-19', '2026-10-21', '2026-11-11'], '2026-11-12'), 3);
});
test('same-day pause and resume do not erase a recorded completion', () => {
  const before = plan();
  const paused = { ...before, status: 'DISABLED', scheduleHistory: reviseSchedule(before, { ...before, status: 'DISABLED' }, new Date('2026-10-21T09:00:00Z')) };
  const resumed = { ...paused, status: 'ACTIVE', scheduleHistory: reviseSchedule(paused, { ...paused, status: 'ACTIVE' }, new Date('2026-10-21T10:00:00Z')) };
  assert.equal(habitStreak(resumed, ['2026-10-19', '2026-10-21'], '2026-10-22'), 2);
});
test('repeated future schedule edits coalesce without overwriting today', () => {
  const before = plan();
  const now = new Date('2026-10-21T09:00:00Z');
  const first = { ...before, weekdays: [2], scheduleHistory: reviseSchedule(before, { ...before, weekdays: [2] }, now) };
  const history = reviseSchedule(first, { ...first, weekdays: [4] }, now);
  assert.equal(history.length, 2);
  assert.deepEqual(scheduleForDate({ ...first, scheduleHistory: history }, '2026-10-22')?.weekdays, [4]);
  assert.deepEqual(scheduleForDate({ ...first, scheduleHistory: history }, '2026-10-21')?.weekdays, [1, 3, 5]);
});
test('midnight uses task timezone including DST fall-back and date-line zones', () => {
  assert.equal(dateKeyInTimezone(new Date('2026-10-25T21:59:59Z'), 'Europe/Kyiv'), '2026-10-25');
  assert.equal(dateKeyInTimezone(new Date('2026-10-25T22:00:00Z'), 'Europe/Kyiv'), '2026-10-26');
  assert.equal(dateKeyInTimezone(new Date('2026-10-25T10:00:00Z'), 'Pacific/Kiritimati'), '2026-10-26');
  assert.equal(dateKeyInTimezone(new Date('2026-10-25T10:00:00Z'), 'America/Los_Angeles'), '2026-10-25');
});
test('today progress counts scheduled weekdays only and deduplicates completion evidence', () => {
  const activity = { ...plan(), id: 'a', scheduleType: 'WEEKLY' as const, status: 'ACTIVE' as const, dueDate: null };
  const completion = { plannedActivityId: 'a', completedForDate: new Date('2026-10-21') };
  assert.deepEqual(calculateTodayProgress([activity], [completion, completion], new Date('2026-10-21T08:00:00Z')), { total: 1, completed: 1, percentage: 100 });
  assert.equal(calculateTodayProgress([activity], [], new Date('2026-10-22T08:00:00Z')).total, 0);
});
test('undo breaks the specific habit chain without affecting other completion dates', () => {
  assert.equal(habitStreak(plan(), ['2026-10-19', '2026-10-23'], '2026-10-23'), 1);
  assert.equal(habitStreak(plan(), ['2026-10-19', '2026-10-21'], '2026-10-23'), 2);
});
