import type { PlannedActivity } from '../types';
import { dateKeyInZone } from '../services/reminder-time';

export function isTaskAvailable(activity: PlannedActivity, now = new Date()) {
  return activity.status === 'ACTIVE' && !activity.isCompletedToday &&
    (activity.scheduleType !== 'DATE' || (activity.dueDate ?? '').slice(0, 10) <= dateKeyInZone(now, activity.timezone));
}

// Overdue first, then today's scheduled tasks, then anytime tasks. Keep finished
// daily tasks below everything actionable, with a stable order between refreshes.
export function orderTasks(activities: PlannedActivity[], now = new Date()) {
  const days = new Map<string, string>();
  const priority = (activity: PlannedActivity) => {
    if (activity.isCompletedToday) return 4;
    if (activity.scheduleType === 'SIMPLE') return 2;
    if (activity.scheduleType === 'DAILY') return 1;
    const date = (activity.dueDate ?? '').slice(0, 10);
    const zone = activity.timezone || 'UTC';
    if (!days.has(zone)) days.set(zone, dateKeyInZone(now, zone));
    const today = days.get(zone)!;
    return date < today ? 0 : date === today ? 1 : 3;
  };
  const priorities = new Map(activities.map((activity) => [activity.id, priority(activity)]));
  return [...activities].sort((a, b) => priorities.get(a.id)! - priorities.get(b.id)! ||
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
    (a.dueTimeMinutes ?? 1440) - (b.dueTimeMinutes ?? 1440) ||
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
