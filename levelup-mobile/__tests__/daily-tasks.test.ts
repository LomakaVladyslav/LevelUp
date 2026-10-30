import { completedOnToday, dailyGroup, filterTasks, todayTasks } from '../utils/daily-tasks';
import { PlannedActivity } from '../types';
const now = new Date('2026-10-29T12:00:00Z'); // Thursday
const task = (id: string, values: Partial<PlannedActivity> = {}): PlannedActivity => ({
  id, userId: 'owner', type: 'CUSTOM', title: id, displayTitle: id, scheduleType: 'SIMPLE', status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', timezone: 'UTC', ...values,
});
test('Today separates overdue one-offs, today dates and weekdays, excluding paused and future tasks', () => {
  const tasks = [task('overdue', { scheduleType: 'DATE', dueDate: '2026-10-20' }), task('today', { scheduleType: 'DATE', dueDate: '2026-10-29' }),
    task('daily', { scheduleType: 'DAILY' }), task('thursday', { scheduleType: 'WEEKLY', weekdays: [4] }),
    task('friday', { scheduleType: 'WEEKLY', weekdays: [5] }), task('paused', { scheduleType: 'DAILY', status: 'DISABLED' }),
    task('future', { scheduleType: 'DATE', dueDate: '2026-11-01' }), task('no-date')];
  expect(todayTasks(tasks, now).map(item => item.id)).toEqual(['overdue', 'daily', 'no-date', 'thursday', 'today']);
  expect(dailyGroup(tasks[0], now)).toBe('overdue');
  expect(dailyGroup(tasks[2], now)).toBe('today'); // Never replay missed recurring backlog.
});
test('timed tasks precede untimed tasks regardless of recurrence kind', () => {
  const tasks = [task('untimed'), task('date', { scheduleType: 'DATE', dueDate: '2026-10-29', dueTimeMinutes: 600 }), task('daily', { scheduleType: 'DAILY', dueTimeMinutes: 480 })];
  expect(todayTasks(tasks, now).map(item => item.id)).toEqual(['daily', 'date', 'untimed']);
});
test('effective historical schedule controls today until tomorrow’s edit takes effect', () => {
  const edited = task('edited', { scheduleType: 'WEEKLY', weekdays: [5], dueTimeMinutes: 900, scheduleHistory: [
    { from: '2026-10-01', scheduleType: 'DAILY', paused: false, weekdays: [], dueDate: null, dueTimeMinutes: 450, timezone: 'UTC' },
    { from: '2026-10-30', scheduleType: 'WEEKLY', paused: false, weekdays: [5], dueDate: null, dueTimeMinutes: 900, timezone: 'UTC' },
  ] });
  expect(todayTasks([task('later', { scheduleType: 'DAILY', dueTimeMinutes: 600 }), edited], now)[0].id).toBe('edited');
});
test('cached yesterday completion flags cannot hide today’s habit', () => {
  const yesterday = task('habit', { scheduleType: 'DAILY', isCompletedToday: true, occurrenceDate: '2026-10-28', completedTodayAt: '2026-10-28T12:00:00Z' });
  expect(completedOnToday(yesterday, now)).toBe(false);
  expect(dailyGroup(yesterday, now)).toBe('today');
  expect(dailyGroup({ ...yesterday, occurrenceDate: '2026-10-29' }, now)).toBeNull();
});
test('task timezone determines the day near midnight', () => {
  const late = new Date('2026-10-29T23:00:00Z');
  expect(dailyGroup(task('Kyiv', { timezone: 'Europe/Kyiv', scheduleType: 'DATE', dueDate: '2026-10-29' }), late)).toBe('overdue');
  expect(dailyGroup(task('LA', { timezone: 'America/Los_Angeles', scheduleType: 'DATE', dueDate: '2026-10-29' }), late)).toBe('today');
});
test('search matches titles, localized titles and descriptions with all filters', () => {
  const tasks = [task('Read', { description: 'TypeScript handbook' }), task('habit', { scheduleType: 'DAILY', displayTitle: 'Читати' }), task('date', { scheduleType: 'DATE' }), task('paused', { status: 'DISABLED', scheduleType: 'WEEKLY' }), task('done', { status: 'COMPLETED' })];
  expect(filterTasks(tasks, 'open', '  TYPESCRIPT ').map(item => item.id)).toEqual(['Read']);
  expect(filterTasks(tasks, 'recurring', 'чит').map(item => item.id)).toEqual(['habit']);
  expect(filterTasks(tasks, 'all', '')).toHaveLength(5);
  expect(filterTasks(tasks, 'open', '')).toHaveLength(3);
  expect(filterTasks(tasks, 'noDate', '').map(item => item.id)).toEqual(['Read']);
  expect(filterTasks(tasks, 'scheduled', '').map(item => item.id)).toEqual(['habit', 'date']);
  expect(filterTasks(tasks, 'paused', '').map(item => item.id)).toEqual(['paused']);
});
