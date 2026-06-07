import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { awardXP } from '../services/xp.service';
import { updateStreak } from '../services/streak.service';
import { checkAndUnlockAchievements } from '../services/achievement.service';
import { calculateAdaptiveXp } from '../services/adaptive-xp.service';
import {
  localizeActivities,
  localizePlannedActivities,
  sourceTextHash,
} from '../services/content-translation.service';
import { getRequestLocale } from '../utils/locale';

const validTypes = ['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'] as const;
const validScheduleTypes = ['SIMPLE', 'DAILY', 'DATE'] as const;
const validStatuses = ['ACTIVE', 'DISABLED'] as const;

type ActivityTypeInput = (typeof validTypes)[number];
type ScheduleTypeInput = (typeof validScheduleTypes)[number];
type EditableStatusInput = (typeof validStatuses)[number];

type PlannedActivityData = {
  type: ActivityTypeInput;
  title: string;
  description: string | null;
  scheduleType: ScheduleTypeInput;
  dueDate: Date | null;
  dueTimeMinutes: number | null;
  timezone: string;
};

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
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1439) return undefined;
  return parsed;
};

const parseDueDate = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  if (typeof value !== 'string') return undefined;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  const date = new Date(dateOnly);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeTimezone = (value: unknown): string => {
  const timezone = cleanText(value) ?? 'UTC';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
};

const dateKeyInTimezone = (date: Date, timezone: string): string => {
  const safeTimezone = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

const dateFromKey = (dateKey: string): Date => new Date(`${dateKey}T00:00:00.000Z`);

const validateCreatePayload = (payload: unknown): {
  data?: PlannedActivityData;
  error?: string;
} => {
  if (!isRecord(payload)) return { error: 'Activity payload must be an object' };

  const title = cleanText(payload.title);
  if (!title) return { error: 'Title is required' };

  if (!isActivityType(payload.type)) {
    return { error: `Type must be one of: ${validTypes.join(', ')}` };
  }

  const scheduleType = payload.scheduleType === undefined
    ? 'SIMPLE'
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

  return {
    data: {
      type: payload.type,
      title,
      description: cleanText(payload.description),
      scheduleType,
      dueDate: scheduleType === 'DATE' ? parsedDueDate : null,
      dueTimeMinutes: dueTimeMinutes ?? null,
      timezone: normalizeTimezone(payload.timezone),
    },
  };
};

const addDailyCompletionState = async <T extends {
  id: string;
  userId: string;
  scheduleType: string;
  status: string;
  timezone: string;
}>(plannedActivities: T[]) => {
  const dailyActivities = plannedActivities.filter(
    (activity) => activity.scheduleType === 'DAILY' && activity.status === 'ACTIVE',
  );

  if (dailyActivities.length === 0) {
    return plannedActivities.map((activity) => ({
      ...activity,
      isCompletedToday: false,
      completedTodayAt: null,
    }));
  }

  const dateByActivityId = new Map<string, Date>();
  const completionDates: Date[] = [];

  for (const activity of dailyActivities) {
    const date = dateFromKey(dateKeyInTimezone(new Date(), activity.timezone));
    dateByActivityId.set(activity.id, date);
    completionDates.push(date);
  }

  const completions = await prisma.activity.findMany({
    where: {
      userId: plannedActivities[0]?.userId,
      plannedActivityId: { in: dailyActivities.map((activity) => activity.id) },
      completedForDate: { in: completionDates },
    },
    select: {
      plannedActivityId: true,
      completedForDate: true,
      completedAt: true,
    },
  });

  const completionByKey = new Map(
    completions.map((activity) => [
      `${activity.plannedActivityId}:${activity.completedForDate?.toISOString()}`,
      activity.completedAt,
    ]),
  );

  return plannedActivities.map((activity) => {
    const completedForDate = dateByActivityId.get(activity.id);
    const completedTodayAt = completedForDate
      ? completionByKey.get(`${activity.id}:${completedForDate.toISOString()}`) ?? null
      : null;

    return {
      ...activity,
      isCompletedToday: Boolean(completedTodayAt),
      completedTodayAt,
    };
  });
};

export const getPlannedActivities = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const includeInactive = req.query.includeInactive === 'true';

    const plannedActivities = await prisma.plannedActivity.findMany({
      where: {
        userId: req.user.id,
        ...(includeInactive ? {} : { status: 'ACTIVE' }),
      },
      include: { translations: true },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const activitiesWithState = await addDailyCompletionState(plannedActivities);
    res.json({
      plannedActivities: await localizePlannedActivities(
        activitiesWithState,
        locale,
      ),
    });
  } catch (error) {
    console.error('Get planned activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPlannedActivity = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const { data, error } = validateCreatePayload(req.body);
    if (!data) {
      res.status(400).json({ error });
      return;
    }

    const plannedActivity = await prisma.plannedActivity.create({
      data: {
        userId: req.user.id,
        ...data,
      },
    });

    const [localizedActivity] = await localizePlannedActivities(
      [{ ...plannedActivity, translations: [] }],
      locale,
    );
    res.status(201).json({ plannedActivity: localizedActivity });
  } catch (error) {
    console.error('Create planned activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPlannedActivitiesBulk = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const activities = req.body.activities;
    if (!Array.isArray(activities) || activities.length === 0) {
      res.status(400).json({ error: 'Activities are required' });
      return;
    }

    if (activities.length > 20) {
      res.status(400).json({ error: 'A maximum of 20 activities can be created at once' });
      return;
    }

    const validated = activities.map(validateCreatePayload);
    const invalid = validated.find((result) => !result.data);
    if (invalid) {
      res.status(400).json({ error: invalid.error });
      return;
    }

    const plannedActivities = await prisma.$transaction(
      validated.map((result) =>
        prisma.plannedActivity.create({
          data: {
            userId: req.user.id,
            ...result.data!,
          },
        }),
      ),
    );

    res.status(201).json({
      plannedActivities: await localizePlannedActivities(
        plannedActivities.map((activity) => ({
          ...activity,
          translations: [],
        })),
        locale,
      ),
    });
  } catch (error) {
    console.error('Create planned activities bulk error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePlannedActivity = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const plannedActivity = await prisma.plannedActivity.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!plannedActivity) {
      res.status(404).json({ error: 'Planned activity not found' });
      return;
    }

    if (plannedActivity.status === 'COMPLETED') {
      res.status(400).json({ error: 'Completed planned activities cannot be edited' });
      return;
    }

    if (!isRecord(req.body)) {
      res.status(400).json({ error: 'Update payload must be an object' });
      return;
    }

    const updateData: Prisma.PlannedActivityUpdateInput = {};

    if (req.body.title !== undefined) {
      const title = cleanText(req.body.title);
      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }
      updateData.title = title;
    }

    if (req.body.description !== undefined) {
      updateData.description = cleanText(req.body.description);
    }

    if (req.body.type !== undefined) {
      if (!isActivityType(req.body.type)) {
        res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
        return;
      }
      updateData.type = req.body.type;
    }

    const nextScheduleType = req.body.scheduleType === undefined
      ? plannedActivity.scheduleType
      : isScheduleType(req.body.scheduleType)
        ? req.body.scheduleType
        : null;

    if (!nextScheduleType) {
      res.status(400).json({ error: `Schedule type must be one of: ${validScheduleTypes.join(', ')}` });
      return;
    }

    if (req.body.scheduleType !== undefined) {
      updateData.scheduleType = nextScheduleType;
    }

    if (req.body.dueTimeMinutes !== undefined) {
      const dueTimeMinutes = parseDueTimeMinutes(req.body.dueTimeMinutes);
      if (dueTimeMinutes === undefined) {
        res.status(400).json({ error: 'Due time must be a whole number between 0 and 1439 minutes' });
        return;
      }
      updateData.dueTimeMinutes = dueTimeMinutes;
    }

    if (req.body.timezone !== undefined) {
      updateData.timezone = normalizeTimezone(req.body.timezone);
    }

    if (nextScheduleType === 'DATE') {
      if (req.body.dueDate !== undefined) {
        const dueDate = parseDueDate(req.body.dueDate);
        if (dueDate === undefined) {
          res.status(400).json({ error: 'Due date must be a valid date' });
          return;
        }
        if (dueDate === null) {
          res.status(400).json({ error: 'Due date is required for date-based activities' });
          return;
        }
        updateData.dueDate = dueDate;
      } else if (!plannedActivity.dueDate) {
        res.status(400).json({ error: 'Due date is required for date-based activities' });
        return;
      }
    } else {
      updateData.dueDate = null;
    }

    if (req.body.status !== undefined) {
      if (!isEditableStatus(req.body.status)) {
        res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        return;
      }

      if (req.body.status === 'DISABLED' && nextScheduleType !== 'DAILY') {
        res.status(400).json({ error: 'Only daily activities can be disabled' });
        return;
      }

      updateData.status = req.body.status;
      updateData.disabledAt = req.body.status === 'DISABLED' ? new Date() : null;
    }

    const textChanged =
      req.body.title !== undefined || req.body.description !== undefined;
    await prisma.$transaction(async (tx) => {
      await tx.plannedActivity.update({
        where: { id: req.params.id },
        data: updateData,
      });

      if (textChanged) {
        await tx.plannedActivityTranslation.deleteMany({
          where: { plannedActivityId: req.params.id },
        });
      }
    });

    const updated = await prisma.plannedActivity.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { translations: true },
    });
    const [plannedWithState] = await addDailyCompletionState([updated]);
    const [localizedActivity] = await localizePlannedActivities(
      [plannedWithState],
      locale,
    );
    res.json({ plannedActivity: localizedActivity });
  } catch (error) {
    console.error('Update planned activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePlannedActivity = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const plannedActivity = await prisma.plannedActivity.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!plannedActivity) {
      res.status(404).json({ error: 'Planned activity not found' });
      return;
    }

    await prisma.plannedActivity.delete({ where: { id: req.params.id } });
    res.json({ message: 'Planned activity deleted' });
  } catch (error) {
    console.error('Delete planned activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const completePlannedActivity = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const plannedActivity = await prisma.plannedActivity.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { translations: true },
    });

    if (!plannedActivity) {
      res.status(404).json({ error: 'Planned activity not found' });
      return;
    }

    if (plannedActivity.status === 'DISABLED') {
      res.status(400).json({ error: 'Disabled activities cannot be completed' });
      return;
    }

    if (plannedActivity.status === 'COMPLETED') {
      res.status(409).json({ error: 'This activity is already completed' });
      return;
    }

    const completedAt = new Date();
    const xpBreakdown = await calculateAdaptiveXp(
      req.user.id,
      plannedActivity.type,
      completedAt,
    );
    const xpEarned = xpBreakdown.totalXp;
    const completedForDate = dateFromKey(
      dateKeyInTimezone(completedAt, plannedActivity.timezone),
    );

    const activity = await prisma.$transaction(async (tx) => {
      if (plannedActivity.scheduleType === 'DAILY') {
        const existingCompletion = await tx.activity.findFirst({
          where: {
            userId: req.user.id,
            plannedActivityId: plannedActivity.id,
            completedForDate,
          },
        });

        if (existingCompletion) {
          throw new Error('DAILY_ALREADY_COMPLETED');
        }
      }

      const createdActivity = await tx.activity.create({
        data: {
          userId: req.user.id,
          plannedActivityId: plannedActivity.id,
          completedForDate,
          type: plannedActivity.type,
          title: plannedActivity.title,
          description: plannedActivity.description,
          xpEarned,
          completedAt,
        },
      });

      const currentSourceHash = sourceTextHash(
        plannedActivity.title,
        plannedActivity.description,
      );
      const currentTranslations = plannedActivity.translations.filter(
        (translation) => translation.sourceHash === currentSourceHash,
      );

      if (currentTranslations.length > 0) {
        await tx.activityTranslation.createMany({
          data: currentTranslations.map((translation) => ({
            activityId: createdActivity.id,
            locale: translation.locale,
            title: translation.title,
            description: translation.description,
            sourceHash: translation.sourceHash,
          })),
          skipDuplicates: true,
        });
      }

      if (plannedActivity.scheduleType !== 'DAILY') {
        await tx.plannedActivity.update({
          where: { id: plannedActivity.id },
          data: { status: 'COMPLETED', completedAt },
        });
      }

      return createdActivity;
    });

    const xpResult = await awardXP(req.user.id, xpEarned, 'activity_completed');
    const streakResult = await updateStreak(req.user.id);
    const newAchievements = await checkAndUnlockAchievements(
      req.user.id,
      locale,
    );
    const activityWithTranslations = await prisma.activity.findUniqueOrThrow({
      where: { id: activity.id },
      include: { translations: true },
    });
    const [localizedActivity] = await localizeActivities(
      [activityWithTranslations],
      locale,
    );

    res.status(201).json({
      activity: localizedActivity,
      xpGained: xpResult.xpGained,
      xpBreakdown,
      levelUp: xpResult.levelUp,
      newLevel: xpResult.newLevel,
      streak: {
        current: streakResult.currentCount,
        longest: streakResult.longestCount,
        isNewRecord: streakResult.isNewRecord,
      },
      newAchievements,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DAILY_ALREADY_COMPLETED') {
      res.status(409).json({ error: 'This daily activity is already completed today' });
      return;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({ error: 'This daily activity is already completed today' });
      return;
    }

    console.error('Complete planned activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
