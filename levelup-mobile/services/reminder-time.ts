import { PlannedActivity } from '../types';

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

export function activityReminderDates(activity: PlannedActivity, now = new Date()): Date[] {
  if (activity.status !== 'ACTIVE' || activity.dueTimeMinutes == null) return [];
  try {
    const timezone = activity.timezone || 'UTC';
    const minutes = activity.dueTimeMinutes;
    if (activity.scheduleType === 'DAILY') {
      const today = dateKeyInZone(now, timezone);
      // Android has no timezone-aware repeating trigger. Renew a rolling month on foreground.
      return Array.from({ length: 31 }, (_, day) => zonedReminderDate(addDays(today, day), minutes, timezone))
        .filter((date): date is Date => date !== null && date > now);
    }
    let key = activity.dueDate?.slice(0, 10);
    if (activity.scheduleType === 'SIMPLE') {
      const reference = new Date(activity.updatedAt);
      key = dateKeyInZone(reference, timezone);
      const date = zonedReminderDate(key, minutes, timezone);
      if (!date || date <= reference) key = addDays(key, 1);
    }
    const date = key ? zonedReminderDate(key, minutes, timezone) : null;
    return date && date > now ? [date] : [];
  } catch { return []; }
}
