import { PlannedActivity, ScheduleRevision } from '../types';

// Convert calendar values in the task's IANA zone, never in the device's current zone.
const partsInZone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return [value('year'), value('month'), value('day'), value('hour'), value('minute')];
};
export const dateKeyInZone = (date: Date, timezone: string) => {
  const [year, month, day] = partsInZone(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const addDays = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export function zonedReminderDate(key: string, minutes: number, timezone: string): Date | null {
  const [year, month, day] = key.split('-').map(Number);
  const wallTime = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let instant = wallTime;
  for (let attempt = 0; attempt < 4; attempt++) {
    const [y, m, d, h, min] = partsInZone(new Date(instant), timezone);
    const difference = wallTime - Date.UTC(y, m - 1, d, h, min);
    if (!difference) return new Date(instant);
    instant += difference;
  }
  // A local time skipped by spring DST has no instant. Do not notify at a different hour.
  return null;
}

export const isRecurring = (type: string) => type === 'DAILY' || type === 'WEEKLY';
export function scheduleOnDate(activity: PlannedActivity, key: string): ScheduleRevision | undefined {
  if (activity.scheduleHistory?.length) return activity.scheduleHistory.filter((item) => item.from <= key).at(-1);
  return { from: activity.createdAt.slice(0, 10), scheduleType: activity.scheduleType, weekdays: activity.weekdays ?? [],
    paused: activity.status === 'DISABLED', dueDate: activity.dueDate?.slice(0, 10) ?? null,
    dueTimeMinutes: activity.dueTimeMinutes ?? null, timezone: activity.timezone };
}
export function isScheduledOn(activity: PlannedActivity, key: string) {
  const schedule = scheduleOnDate(activity, key);
  return Boolean(schedule && !schedule.paused && (schedule.scheduleType === 'DAILY' ||
    (schedule.scheduleType === 'WEEKLY' && schedule.weekdays.includes(new Date(`${key}T00:00:00Z`).getUTCDay())) ||
    (schedule.scheduleType === 'DATE' && schedule.dueDate === key)));
}
export function activityReminderDates(activity: PlannedActivity, now = new Date()): Date[] {
  if (activity.status !== 'ACTIVE') return [];
  try {
    const timezone = activity.timezone || 'UTC';
    const today = dateKeyInZone(now, timezone);
    const completedDate = activity.completedTodayAt ? dateKeyInZone(new Date(activity.completedTodayAt), timezone) :
      activity.isCompletedToday ? activity.occurrenceDate ?? today : null;
    if (isRecurring(activity.scheduleType)) {
      return Array.from({ length: 31 }, (_, day) => {
        const key = addDays(today, day);
        const schedule = scheduleOnDate(activity, key);
        if (key === completedDate || !schedule || schedule.dueTimeMinutes === null || !isScheduledOn(activity, key)) return null;
        return zonedReminderDate(key, schedule.dueTimeMinutes, schedule.timezone);
      }).filter((date): date is Date => date !== null && date > now);
    }
    if (activity.dueTimeMinutes == null || activity.scheduleType !== 'DATE') return [];
    const key = activity.dueDate?.slice(0, 10);
    const date = key ? zonedReminderDate(key, activity.dueTimeMinutes, timezone) : null;
    return date && date > now ? [date] : [];
  } catch { return []; }
}
