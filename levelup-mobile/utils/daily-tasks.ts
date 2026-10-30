import { PlannedActivity } from '../types';
import { dateKeyInZone, isRecurring, isScheduledOn, scheduleOnDate } from '../services/reminder-time';

export const taskFilters = ['open', 'all', 'noDate', 'scheduled', 'recurring', 'paused'] as const;
export type TaskFilter = typeof taskFilters[number];

// Re-evaluate calendar state on cached data; yesterday's completion flag is not today's.
export function completedOnToday(task: PlannedActivity, now = new Date()) {
  const today = dateKeyInZone(now, task.timezone);
  return Boolean(task.isCompletedToday && (task.occurrenceDate === today ||
    (!task.occurrenceDate && task.completedTodayAt && dateKeyInZone(new Date(task.completedTodayAt), task.timezone) === today)));
}
export function dailyGroup(task: PlannedActivity, now = new Date()): 'overdue' | 'today' | null {
  if (task.status !== 'ACTIVE' || completedOnToday(task, now)) return null;
  const today = dateKeyInZone(now, task.timezone);
  if (isRecurring(task.scheduleType)) return isScheduledOn(task, today) ? 'today' : null;
  if (task.scheduleType === 'SIMPLE') return 'today';
  const due = task.dueDate?.slice(0, 10);
  return due && due < today ? 'overdue' : due === today ? 'today' : null;
}
export function todayTasks(tasks: PlannedActivity[], now = new Date()) {
  const group = new Map(tasks.map(task => [task.id, dailyGroup(task, now)]));
  const time = (task: PlannedActivity) => scheduleOnDate(task, dateKeyInZone(now, task.timezone))?.dueTimeMinutes ?? 1440;
  return tasks.filter(task => group.get(task.id)).sort((a, b) =>
    Number(group.get(a.id) !== 'overdue') - Number(group.get(b.id) !== 'overdue') ||
    (group.get(a.id) === 'overdue' ? (a.dueDate ?? '').localeCompare(b.dueDate ?? '') : 0) ||
    time(a) - time(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function filterTasks(tasks: PlannedActivity[], filter: TaskFilter, search: string) {
  const needle = search.trim().toLocaleLowerCase();
  return tasks.filter(task => {
    if (needle && ![task.title, task.displayTitle, task.description, task.displayDescription].some(value => value?.toLocaleLowerCase().includes(needle))) return false;
    if (filter === 'all') return true;
    if (filter === 'paused') return task.status === 'DISABLED';
    if (task.status !== 'ACTIVE') return false;
    if (filter === 'noDate') return task.scheduleType === 'SIMPLE';
    if (filter === 'scheduled') return task.scheduleType !== 'SIMPLE';
    if (filter === 'recurring') return isRecurring(task.scheduleType);
    return true;
  });
}
