import { dateKeyInTimezone } from './planned-activity-metrics.service';

export type Schedule = {
  from: string; scheduleType: string; weekdays: number[]; paused: boolean;
  dueDate: string | null; dueTimeMinutes: number | null; timezone: string;
};
export type RecurringPlan = {
  scheduleType: string; weekdays?: number[]; status: string; timezone: string;
  disabledAt?: Date | null;
  createdAt?: Date; dueDate?: Date | null; dueTimeMinutes?: number | null;
  scheduleHistory?: unknown;
};
export const isRecurring = (type: string) => type === 'DAILY' || type === 'WEEKLY';
export const shiftDate = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export function snapshot(plan: RecurringPlan, from: string): Schedule {
  return { from, scheduleType: plan.scheduleType, weekdays: plan.weekdays ?? [], paused: plan.status === 'DISABLED',
    dueDate: plan.dueDate?.toISOString().slice(0, 10) ?? null, dueTimeMinutes: plan.dueTimeMinutes ?? null, timezone: plan.timezone };
}
export function scheduleHistory(plan: RecurringPlan): Schedule[] {
  const history = plan.scheduleHistory;
  if (Array.isArray(history) && history.length) return history as Schedule[];
  const first = snapshot({ ...plan, status: 'ACTIVE' }, dateKeyInTimezone(plan.createdAt ?? new Date('1970-01-01'), plan.timezone));
  if (plan.status !== 'DISABLED') return [first];
  const pause = snapshot(plan, dateKeyInTimezone(plan.disabledAt ?? plan.createdAt ?? new Date('1970-01-01'), plan.timezone));
  return first.from < pause.from ? [first, pause] : [pause];
}
export function scheduleForDate(plan: RecurringPlan, key: string): Schedule | undefined {
  return scheduleHistory(plan).filter((item) => item.from <= key).at(-1);
}
export function scheduledOn(plan: RecurringPlan, key: string): boolean {
  const schedule = scheduleForDate(plan, key);
  if (!schedule || schedule.paused) return false;
  if (schedule.scheduleType === 'DAILY') return true;
  if (schedule.scheduleType === 'WEEKLY') return schedule.weekdays.includes(new Date(`${key}T00:00:00Z`).getUTCDay());
  return schedule.scheduleType === 'DATE' && schedule.dueDate === key;
}
// Calendar revisions preserve the schedule of past dates. Pause takes effect today;
// recurring edits/resume start tomorrow. One-off edits apply immediately.
// Multiple edits for the same effective date coalesce.
export function reviseSchedule(before: RecurringPlan, after: RecurringPlan, now = new Date()): Schedule[] {
  const today = dateKeyInTimezone(now, before.timezone);
  const from = after.status === 'DISABLED' || (!isRecurring(before.scheduleType) && !isRecurring(after.scheduleType)) ? today : shiftDate(today, 1);
  const history = scheduleHistory(before).filter((item) => item.from < from);
  return [...history, snapshot(after, from)];
}
export function habitStreak(plan: RecurringPlan, completions: string[], today: string): number {
  const completed = new Set(completions);
  const start = scheduleHistory(plan)[0].from;
  let count = 0;
  for (let date = today; date >= start; date = shiftDate(date, -1)) {
    // Recorded completions survive a schedule edit or a same-day pause.
    if (completed.has(date)) { count++; continue; }
    if (date !== today && scheduledOn(plan, date)) break;
  }
  return count;
}
