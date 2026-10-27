import { isTaskAvailable, orderTasks } from '../utils/task-order';
import type { PlannedActivity } from '../types';

const now = new Date('2026-09-07T23:00:00Z');
const task = (id: string, extra: Partial<PlannedActivity> = {}): PlannedActivity => ({
  id, userId: 'user', title: id, displayTitle: id, type: 'STUDY', status: 'ACTIVE',
  scheduleType: 'SIMPLE', timezone: 'UTC', createdAt: '2026-09-01', updatedAt: '2026-09-01', ...extra,
});

test('next-task order prioritizes overdue and today, with completed daily tasks last', () => {
  const tasks = [task('anytime'), task('done', { scheduleType: 'DAILY', isCompletedToday: true }),
    task('future', { scheduleType: 'DATE', dueDate: '2026-09-09' }),
    task('today', { scheduleType: 'DAILY' }), task('overdue', { scheduleType: 'DATE', dueDate: '2026-09-06' })];
  expect(orderTasks(tasks, now).map((item) => item.id)).toEqual(['overdue', 'today', 'anytime', 'future', 'done']);
  expect(tasks[0].id).toBe('anytime');
});

test('due-day availability follows the task timezone and excludes paused or finished tasks', () => {
  expect(isTaskAvailable(task('tomorrow', { scheduleType: 'DATE', dueDate: '2026-09-08', timezone: 'Asia/Tokyo' }), now)).toBe(true);
  expect(isTaskAvailable(task('tomorrow', { scheduleType: 'DATE', dueDate: '2026-09-08', timezone: 'America/Los_Angeles' }), now)).toBe(false);
  expect(isTaskAvailable(task('paused', { status: 'DISABLED' }), now)).toBe(false);
  expect(isTaskAvailable(task('done', { scheduleType: 'DAILY', isCompletedToday: true }), now)).toBe(false);
});
