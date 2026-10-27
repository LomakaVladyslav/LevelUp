export type PlannedActivityMetricInput = {
  id: string;
  scheduleType: 'SIMPLE' | 'DAILY' | 'DATE';
  status: 'ACTIVE' | 'COMPLETED' | 'DISABLED';
  dueDate: Date | null;
  timezone: string;
};

export type PlannedActivityCompletionInput = {
  plannedActivityId: string | null;
  completedForDate: Date | null;
};

export type TodayProgress = {
  completed: number;
  total: number;
  percentage: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timezone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    if (formatters.size >= 64) formatters.delete(formatters.keys().next().value!);
    formatters.set(timezone, formatter);
  }
  return formatter;
};

export const normalizeTimezone = (timezone: string): string => {
  try { formatterFor(timezone); return timezone; }
  catch { return 'UTC'; }
};

export const dateKeyInTimezone = (date: Date, timezone: string): string => {
  const parts = formatterFor(normalizeTimezone(timezone)).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')!.value;
  const month = parts.find((part) => part.type === 'month')!.value;
  const day = parts.find((part) => part.type === 'day')!.value;
  return `${year}-${month}-${day}`;
};

export const dateFromKey = (dateKey: string): Date =>
  new Date(`${dateKey}T00:00:00.000Z`);

const dateKeyFromStoredDate = (date: Date): string =>
  date.toISOString().slice(0, 10);

const previousDateKey = (dateKey: string): string => {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() - 1);
  return dateKeyFromStoredDate(date);
};

export const calculateActivityStreak = (
  completionDateKeys: string[],
  todayDateKey: string,
): number => {
  const dates = new Set(completionDateKeys);
  const yesterdayDateKey = previousDateKey(todayDateKey);
  let cursor = dates.has(todayDateKey)
    ? todayDateKey
    : dates.has(yesterdayDateKey)
      ? yesterdayDateKey
      : null;

  if (!cursor) return 0;

  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }

  return streak;
};

export const calculateTodayProgress = (
  activities: PlannedActivityMetricInput[],
  completions: PlannedActivityCompletionInput[],
  now: Date,
): TodayProgress => {
  const completionKeys = new Set(
    completions.flatMap((completion) =>
      completion.plannedActivityId && completion.completedForDate
        ? [
            `${completion.plannedActivityId}:${dateKeyFromStoredDate(
              completion.completedForDate,
            )}`,
          ]
        : [],
    ),
  );

  let total = 0;
  let completed = 0;

  for (const activity of activities) {
    if (activity.status === 'DISABLED' || activity.scheduleType === 'SIMPLE') {
      continue;
    }

    const todayDateKey = dateKeyInTimezone(now, activity.timezone);
    const dueToday =
      activity.scheduleType === 'DAILY' ||
      (activity.scheduleType === 'DATE' &&
        activity.dueDate !== null &&
        dateKeyFromStoredDate(activity.dueDate) === todayDateKey);

    if (!dueToday) continue;

    total += 1;
    if (completionKeys.has(`${activity.id}:${todayDateKey}`)) {
      completed += 1;
    }
  }

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
};


export const getRequestTimezone = (req: { get: (name: string) => string | undefined }): string =>
  normalizeTimezone(req.get('X-Timezone') ?? 'UTC');
