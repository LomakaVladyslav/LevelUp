import { isRecurring, scheduledOn, habitStreak, snapshot, reviseSchedule, scheduleForDate } from '../services/recurrence.service';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { completeActivity } from '../services/completion.service';
import { runMutation, withUserLock } from '../services/user-mutation.service';
import { localizePlannedActivities } from '../services/content-translation.service';
import { dateOnly, textField } from '../utils/validation';
import { HttpError, sendError } from '../utils/http-error';
import { getRequestLocale } from '../utils/locale';
import {
  calculateTodayProgress,
  dateFromKey,
  dateKeyInTimezone,
  normalizeTimezone,
  getRequestTimezone,
} from '../services/planned-activity-metrics.service';

const validTypes = ['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'] as const;
const validScheduleTypes = ['SIMPLE', 'DAILY', 'WEEKLY', 'DATE'] as const;
const validStatuses = ['ACTIVE', 'DISABLED'] as const;

type ActivityTypeInput = (typeof validTypes)[number];
type ScheduleTypeInput = (typeof validScheduleTypes)[number];
type EditableStatusInput = (typeof validStatuses)[number];

type PlannedActivityData = {
  weekdays: number[];
  type: ActivityTypeInput;
  title: string;
  description: string | null;
  motivationText: string | null;
  scheduleType: ScheduleTypeInput;
  dueDate: Date | null;
  dueTimeMinutes: number | null;
  timezone: string;
};

const translationInclude = (locale: string) => ({
  translations: {
    where: { locale: { in: [locale, 'en'] } },
  },
});

const storedDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isActivityType = (value: unknown): value is ActivityTypeInput =>
  typeof value === 'string' && validTypes.includes(value as ActivityTypeInput);

const isScheduleType = (value: unknown): value is ScheduleTypeInput =>
  typeof value === 'string' && validScheduleTypes.includes(value as ScheduleTypeInput);

const isEditableStatus = (value: unknown): value is EditableStatusInput =>
  typeof value === 'string' && validStatuses.includes(value as EditableStatusInput);

const parseDueTimeMinutes = (value: unknown): number | null | undefined => {
  if (value === undefined) return null;
  if (value === null || value === '') return null;

  if (typeof value !== 'number') return undefined;
  const parsed = value;
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1439) return undefined;
  return parsed;
};

const parseDueDate = dateOnly;

const validateCreatePayload = (payload: unknown): {
  data?: PlannedActivityData;
  error?: string;
} => {
  if (!isRecord(payload)) return { error: 'Activity payload must be an object' };

  const title = textField(payload.title, 'Title', 200, true);
  if (!title) return { error: 'Title is required' };

  if (payload.type !== undefined && !isActivityType(payload.type)) {
    return { error: `Type must be one of: ${validTypes.join(', ')}` };
  }

  const scheduleType = payload.scheduleType === undefined
    ? payload.dueDate ? 'DATE' : 'SIMPLE'
    : isScheduleType(payload.scheduleType)
      ? payload.scheduleType
      : null;

  if (!scheduleType) {
    return { error: `Schedule type must be one of: ${validScheduleTypes.join(', ')}` };
  }

  const dueTimeMinutes = parseDueTimeMinutes(payload.dueTimeMinutes);
  if (dueTimeMinutes === undefined) {
    return { error: 'Due time must be a whole number between 0 and 1439 minutes' };
  }

  const parsedDueDate = parseDueDate(payload.dueDate);
  if (parsedDueDate === undefined) return { error: 'Due date must be a valid date' };
  if (scheduleType === 'DATE' && !parsedDueDate) {
    return { error: 'Due date is required for date-based activities' };
  }

  if (payload.timezone !== undefined && (typeof payload.timezone !== 'string' || normalizeTimezone(payload.timezone) !== payload.timezone)) return { error: 'Invalid timezone' };

  const weekdays = payload.weekdays ?? [];
  if (!Array.isArray(weekdays) || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(weekdays).size !== weekdays.length || (scheduleType === 'WEEKLY' && !weekdays.length)) return { error: 'Choose distinct weekdays from 0 (Sunday) to 6 (Saturday)' };
  if (scheduleType === 'SIMPLE' && dueTimeMinutes !== null) return { error: 'A reminder time requires a date or recurrence' };

  return {
    data: {
      type: (payload.type ?? 'CUSTOM') as ActivityTypeInput,
      weekdays: scheduleType === 'WEEKLY' ? weekdays : [],
      title,
      description: textField(payload.description, 'Description', 5000),
      motivationText: textField(payload.motivationText, 'Motivation text', 300),
      scheduleType,
      dueDate: scheduleType === 'DATE' ? parsedDueDate : null,
      dueTimeMinutes: dueTimeMinutes ?? null,
      timezone: normalizeTimezone(cleanText(payload.timezone) ?? 'UTC'),
    },
  };
};

export const getPlannedActivities = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const includeInactive = req.query.includeInactive === 'true';
    const includeDisabled = req.query.includeDisabled === 'true';
    const { activitiesWithMetrics, metricActivities, completions, now } = await prisma.$transaction(async (tx) => {
    const now = new Date();

    const metricActivities = await tx.plannedActivity.findMany({
      where: {
        userId: req.user.id,
        ...(includeInactive
          ? {}
          : {
              OR: [
                { status: 'ACTIVE' },
                ...(includeDisabled ? [{ status: 'DISABLED' as const }] : []),
                { status: 'COMPLETED', scheduleType: 'DATE', dueDate: { gte: new Date(now.getTime() - 2 * 86400000), lte: new Date(now.getTime() + 2 * 86400000) } },
              ],
          }),
      },
      include: translationInclude(locale),
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const visibleActivities = includeInactive
      ? metricActivities
      : metricActivities.filter((activity) => activity.status === 'ACTIVE' || (includeDisabled && activity.status === 'DISABLED'));
    const dailyActivities = visibleActivities.filter(
      (activity) => isRecurring(activity.scheduleType),
    );
    const progressCompletionTargets = metricActivities.flatMap((activity) => {
      if (activity.status === 'DISABLED' || activity.scheduleType === 'SIMPLE') {
        return [];
      }

      const todayDateKey = dateKeyInTimezone(now, activity.timezone);
      const dueToday =
        (isRecurring(activity.scheduleType) && scheduledOn(activity, todayDateKey)) ||
        (activity.scheduleType === 'DATE' &&
          activity.dueDate !== null &&
          storedDateKey(activity.dueDate) === todayDateKey);

      return dueToday
        ? [{ id: activity.id, completedForDate: dateFromKey(todayDateKey) }]
        : [];
    });
    const progressCompletionDates = [
      ...new Map(
        progressCompletionTargets.map((target) => [
          target.completedForDate.toISOString(),
          target.completedForDate,
        ]),
      ).values(),
    ];

    const [streakCompletions, progressCompletions] = await Promise.all([
      dailyActivities.length > 0
        ? tx.activity.findMany({
            where: {
              userId: req.user.id,
              plannedActivityId: {
                in: dailyActivities.map((activity) => activity.id),
              },
              completedForDate: { not: null },
            },
            select: {
              plannedActivityId: true,
              completedForDate: true,
              completedAt: true,
            },
          })
        : Promise.resolve([]),
      progressCompletionTargets.length > 0
        ? tx.activity.findMany({
            where: {
              userId: req.user.id,
              plannedActivityId: {
                in: progressCompletionTargets.map((activity) => activity.id),
              },
              completedForDate: { in: progressCompletionDates },
            },
            select: {
              plannedActivityId: true,
              completedForDate: true,
              completedAt: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const completions = [...streakCompletions, ...progressCompletions];

    const completionDatesByActivityId = new Map<string, string[]>();
    const completionTodayByActivityId = new Map<string, Date>();
    const plannedActivityById = new Map(
      metricActivities.map((activity) => [activity.id, activity]),
    );

    for (const completion of completions) {
      if (!completion.plannedActivityId || !completion.completedForDate) continue;

      const dateKey = storedDateKey(completion.completedForDate);
      const dates =
        completionDatesByActivityId.get(completion.plannedActivityId) ?? [];
      dates.push(dateKey);
      completionDatesByActivityId.set(completion.plannedActivityId, dates);

      const plannedActivity = plannedActivityById.get(
        completion.plannedActivityId,
      );
      if (
        plannedActivity &&
        dateKey === dateKeyInTimezone(now, plannedActivity.timezone)
      ) {
        completionTodayByActivityId.set(
          completion.plannedActivityId,
          completion.completedAt,
        );
      }
    }

    const activitiesWithMetrics = visibleActivities.map((activity) => {
      const completedTodayAt =
        completionTodayByActivityId.get(activity.id) ?? null;
      const streakDays = isRecurring(activity.scheduleType)
        ? habitStreak(
            activity,
            completionDatesByActivityId.get(activity.id) ?? [],
            dateKeyInTimezone(now, activity.timezone),
          )
        : null;

      return {
        ...activity,
        occurrenceDate: dateKeyInTimezone(now, activity.timezone),
        effectiveSchedule: scheduleForDate(activity, dateKeyInTimezone(now, activity.timezone)),
        isScheduledToday: scheduledOn(activity, dateKeyInTimezone(now, activity.timezone)),
        isCompletedToday:
          isRecurring(activity.scheduleType) && Boolean(completedTodayAt),
        completedTodayAt:
          isRecurring(activity.scheduleType) ? completedTodayAt : null,
        streakDays,
      };
    });

      return { activitiesWithMetrics, metricActivities, completions, now };
    }, { isolationLevel: 'RepeatableRead', timeout: 10000 });

    res.json({
      plannedActivities: await localizePlannedActivities(
        activitiesWithMetrics,
        locale,
      ),
      todayProgress: calculateTodayProgress(
        metricActivities,
        completions,
        now,
      ),
    });
  } catch (error) {
    console.error('Get planned activities failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPlannedActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = validateCreatePayload(req.body);
    if (!data) throw new HttpError(400, error!);
    const result = await runMutation(req, async (tx) => {
      const plannedActivity = await tx.plannedActivity.create({ data: { userId: req.user.id, ...data, scheduleHistory: [snapshot({ ...data, status: 'ACTIVE' }, dateKeyInTimezone(new Date(), data.timezone))] } });
      return { plannedActivity: displayPlanned(plannedActivity) };
    });
    res.status(201).json(result);
  } catch (error) { sendError(res, error); }
};

const displayPlanned = <T extends { title: string; description: string | null; motivationText: string | null }>(activity: T) => ({
  ...activity, displayTitle: activity.title, displayDescription: activity.description, displayMotivationText: activity.motivationText,
});

export const createPlannedActivitiesBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    const activities = req.body?.activities;
    if (!Array.isArray(activities) || !activities.length || activities.length > 20) throw new HttpError(400, 'Supply between 1 and 20 activities');
    const validated = activities.map(validateCreatePayload);
    const invalid = validated.find((result) => !result.data);
    if (invalid) throw new HttpError(400, invalid.error!);
    const result = await runMutation(req, async (tx) => {
      const plannedActivities = [];
      for (const item of validated) {
        plannedActivities.push(displayPlanned(await tx.plannedActivity.create({ data: { userId: req.user.id, ...item.data!, scheduleHistory: [snapshot({ ...item.data!, status: 'ACTIVE' }, dateKeyInTimezone(new Date(), item.data!.timezone))] } })));
      }
      return { plannedActivities };
    });
    res.status(201).json(result);
  } catch (error) { sendError(res, error); }
};

export const updatePlannedActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isRecord(req.body)) throw new HttpError(400, 'Update payload must be an object');
    const result = await runMutation(req, async (tx) => {
      const existing = await tx.plannedActivity.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!existing) throw new HttpError(404, 'Planned activity not found', 'NOT_FOUND');
      if (existing.status === 'COMPLETED') throw new HttpError(409, 'Completed planned activities cannot be edited', 'ACTIVITY_ALREADY_COMPLETED');
      if (req.body.updatedAt !== undefined && req.body.updatedAt !== existing.updatedAt.toISOString()) {
        throw new HttpError(409, 'This activity has changed. Reload it before editing.', 'ACTIVITY_CHANGED');
      }
      const editable = ['type', 'title', 'description', 'motivationText', 'scheduleType', 'dueDate', 'dueTimeMinutes', 'timezone', 'weekdays'];
      const supplied = Object.fromEntries(Object.entries(req.body).filter(([key]) => editable.includes(key)));
      const { data, error } = validateCreatePayload({ ...existing, dueDate: existing.dueDate?.toISOString() ?? null, ...supplied });
      if (!data) throw new HttpError(400, error!);
      const status = req.body.status ?? existing.status;
      if (!isEditableStatus(status) || (status === 'DISABLED' && !isRecurring(data.scheduleType))) throw new HttpError(400, 'Only recurring activities can be paused');
      // Keep an established recurring series recurring: converting it would mix
      // one-off state and historical occurrences. Create a separate one-off instead.
      if (isRecurring(existing.scheduleType) && !isRecurring(data.scheduleType)) throw new HttpError(400, 'A recurring task must retain recurrence');
      if (isRecurring(existing.scheduleType) && data.timezone !== existing.timezone) throw new HttpError(400, 'A recurring task retains its timezone');
      const changed = ['scheduleType', 'dueDate', 'dueTimeMinutes', 'timezone', 'weekdays', 'status'].some((key) =>
        JSON.stringify(({ ...data, status } as Record<string, unknown>)[key]) !== JSON.stringify((existing as unknown as Record<string, unknown>)[key]));
      const activity = await tx.plannedActivity.update({ where: { id: existing.id }, data: {
        ...data, status, ...(changed ? { scheduleHistory: reviseSchedule(existing, { ...data, status }) } : {}), disabledAt: status === 'DISABLED' ? existing.disabledAt ?? new Date() : null,
      } });
      if (data.title !== existing.title || data.description !== existing.description || data.motivationText !== existing.motivationText) {
        await tx.plannedActivityTranslation.deleteMany({ where: { plannedActivityId: existing.id } });
      }
      return { plannedActivity: displayPlanned(activity) };
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
};

export const deletePlannedActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    await withUserLock(req.user.id, async (tx) => {
      // Deleting a plan preserves completed history and earned rewards.
      await tx.plannedActivity.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    }, req.user.sessionVersion);
    res.json({ message: 'Planned activity deleted' });
  } catch (error) { sendError(res, error); }
};

export const completePlannedActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runMutation(req, (tx) => completeActivity(tx, {
      userId: req.user.id, locale: getRequestLocale(req), timezone: getRequestTimezone(req), plannedActivityId: req.params.id, completionDate: req.body?.completionDate, expectedUpdatedAt: req.body?.updatedAt,
    }));
    res.status(201).json(result);
  } catch (error) { sendError(res, error); }
};
