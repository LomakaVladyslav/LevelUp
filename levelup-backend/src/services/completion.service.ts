import { isRecurring, scheduledOn } from './recurrence.service';
import { ActivityType, Prisma } from '@prisma/client';
import { calculateAdaptiveXp } from './adaptive-xp.service';
import { awardXP } from './xp.service';
import { updateStreak } from './streak.service';
import { checkAndUnlockAchievements } from './achievement.service';
import { SupportedLocale } from '../utils/locale';
import { dateFromKey, dateKeyInTimezone } from './planned-activity-metrics.service';
import { HttpError } from '../utils/http-error';

export type CompletionInput = {
  userId: string; locale: SupportedLocale; timezone: string;
  plannedActivityId?: string; completionDate?: unknown; expectedUpdatedAt?: unknown;
  type?: ActivityType; title?: string; description?: string | null; duration?: number | null;
};

// Caller owns the user lock and transaction: activity, rewards, goals and receipt commit together.
export async function completeActivity(db: Prisma.TransactionClient, input: CompletionInput) {
  const { userId, locale } = input;
  const before = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true, xp: true } });
  const planned = input.plannedActivityId
    ? await db.plannedActivity.findFirst({ where: { id: input.plannedActivityId, userId } })
    : null;
  if (input.plannedActivityId && !planned) throw new HttpError(404, 'Planned activity not found', 'NOT_FOUND');
  if (planned?.status === 'DISABLED') throw new HttpError(400, 'Disabled activities cannot be completed', 'ACTIVITY_DISABLED');
  if (planned?.status === 'COMPLETED') throw new HttpError(409, 'This activity is already completed', 'ACTIVITY_ALREADY_COMPLETED');

  const completedAt = new Date();
  const timezone = planned?.timezone ?? input.timezone;
  const completedForDate = dateFromKey(dateKeyInTimezone(completedAt, timezone));
  if (planned && isRecurring(planned.scheduleType) && input.completionDate !== undefined && input.completionDate !== dateKeyInTimezone(completedAt, timezone)) {
    throw new HttpError(409, 'The day has changed. Reload before completing this activity.', 'ACTIVITY_CHANGED');
  }
  if (planned) {
    const existing = await db.activity.findFirst({ where: { userId, plannedActivityId: planned.id, completedForDate } });
    if (existing) throw new HttpError(409, 'This daily activity is already completed today', 'ACTIVITY_ALREADY_COMPLETED');
  }
  if (planned && input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== planned.updatedAt.toISOString()) throw new HttpError(409, 'The task has changed. Reload before completing.', 'ACTIVITY_CHANGED');
  if (planned && isRecurring(planned.scheduleType) && !scheduledOn(planned, dateKeyInTimezone(completedAt, timezone))) throw new HttpError(409, 'This task is not scheduled today', 'NOT_SCHEDULED');
  const type = planned?.type ?? input.type!;
  const xpBreakdown = await calculateAdaptiveXp(userId, type, completedAt, db, input.timezone);
  const activity = await db.activity.create({ data: {
    userId, type, title: planned?.title ?? input.title!,
    description: planned?.description ?? input.description ?? null,
    duration: input.duration ?? null,
    plannedActivityId: planned?.id, completedForDate,
    xpEarned: xpBreakdown.totalXp, completedAt, streakDate: dateFromKey(dateKeyInTimezone(completedAt, input.timezone)),
  } });
  if (planned && !isRecurring(planned.scheduleType)) {
    await db.plannedActivity.update({ where: { id: planned.id }, data: { status: 'COMPLETED', completedAt } });
  }
  await awardXP(userId, activity.xpEarned, 'activity_completed', db, completedAt);
  const streak = await updateStreak(userId, db, completedAt, input.timezone);
  const goals = await db.goal.findMany({ where: {
    userId, type,
    OR: [{ deadline: null }, { deadline: { gte: completedAt } }],
  } });
  const goalContributions = [];
  for (const goal of goals) {
    const currentCount = Math.min(goal.currentCount + 1, goal.targetCount);
    goalContributions.push({ id: goal.id, version: goal.progressVersion, amount: 1 });
    await db.goal.update({ where: { id: goal.id }, data: { currentCount, isCompleted: currentCount >= goal.targetCount } });
  }
  if (goalContributions.length) await db.activity.update({ where: { id: activity.id }, data: { goalContributions } });
  const newAchievements = await checkAndUnlockAchievements(userId, locale, db);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, level: true } });
  return {
    activity: { ...activity, displayTitle: activity.title, displayDescription: activity.description },
    xpGained: activity.xpEarned, achievementXpGained: user.xp - before.xp - activity.xpEarned,
    totalXp: user.xp, xpBreakdown, levelUp: user.level > before.level, newLevel: user.level,
    streak: { current: streak.currentCount, longest: streak.longestCount, isNewRecord: streak.isNewRecord },
    newAchievements,
  };
}
