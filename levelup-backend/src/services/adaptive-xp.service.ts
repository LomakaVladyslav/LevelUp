import { ActivityType } from '@prisma/client';
import prisma from '../utils/prisma';
import { XP_PER_ACTIVITY } from '../utils/constants';

const CORE_ACTIVITY_TYPES: ActivityType[] = ['STUDY', 'WORKOUT', 'HABIT'];
const BALANCE_WINDOW_DAYS = 14;
const MIN_BALANCE_SAMPLE_SIZE = 4;
const UNDERREPRESENTED_SHARE = 0.2;
const COMEBACK_AFTER_DAYS = 3;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface AdaptiveXpContext {
  activityType: ActivityType;
  baseXp: number;
  projectedStreak: number;
  recentCategoryCounts: Partial<Record<ActivityType, number>>;
  inactiveForMs: number | null;
}

export interface XpBreakdown {
  baseXp: number;
  streakDays: number;
  streakMultiplier: number;
  streakBonus: number;
  balanceMultiplier: number;
  balanceBonus: number;
  balanceApplied: boolean;
  comebackMultiplier: number;
  comebackBonus: number;
  comebackApplied: boolean;
  totalXp: number;
}

const startOfLocalDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const calendarDayDifference = (later: Date, earlier: Date): number =>
  Math.round(
    (startOfLocalDay(later).getTime() - startOfLocalDay(earlier).getTime()) /
      DAY_IN_MS,
  );

export const getStreakMultiplier = (streakDays: number): number => {
  if (streakDays >= 14) return 1.3;
  if (streakDays >= 7) return 1.2;
  if (streakDays >= 3) return 1.1;
  return 1;
};

export const getProjectedStreak = (
  currentCount: number,
  lastActivityDate: Date | null,
  completedAt: Date,
): number => {
  if (!lastActivityDate) return 1;

  const daysSinceLastActivity = calendarDayDifference(
    completedAt,
    lastActivityDate,
  );

  if (daysSinceLastActivity <= 0) return Math.max(currentCount, 1);
  if (daysSinceLastActivity === 1) return currentCount + 1;
  return 1;
};

export const isBalanceBonusEligible = (
  activityType: ActivityType,
  recentCategoryCounts: Partial<Record<ActivityType, number>>,
): boolean => {
  if (!CORE_ACTIVITY_TYPES.includes(activityType)) return false;

  const totalCoreActivities = CORE_ACTIVITY_TYPES.reduce(
    (total, type) => total + (recentCategoryCounts[type] ?? 0),
    0,
  );

  if (totalCoreActivities < MIN_BALANCE_SAMPLE_SIZE) return false;

  const categoryShare =
    (recentCategoryCounts[activityType] ?? 0) / totalCoreActivities;

  return categoryShare < UNDERREPRESENTED_SHARE;
};

export const calculateXpBreakdown = (
  context: AdaptiveXpContext,
): XpBreakdown => {
  const streakMultiplier = getStreakMultiplier(context.projectedStreak);
  const streakBonus = Math.round(
    context.baseXp * (streakMultiplier - 1),
  );

  const balanceApplied = isBalanceBonusEligible(
    context.activityType,
    context.recentCategoryCounts,
  );
  const balanceMultiplier = balanceApplied ? 1.25 : 1;
  const balanceBonus = balanceApplied
    ? Math.round(context.baseXp * 0.25)
    : 0;

  const comebackApplied =
    context.inactiveForMs !== null &&
    context.inactiveForMs >= COMEBACK_AFTER_DAYS * DAY_IN_MS;
  const comebackMultiplier = comebackApplied ? 1.5 : 1;
  const comebackBonus = comebackApplied
    ? Math.round(context.baseXp * 0.5)
    : 0;

  return {
    baseXp: context.baseXp,
    streakDays: context.projectedStreak,
    streakMultiplier,
    streakBonus,
    balanceMultiplier,
    balanceBonus,
    balanceApplied,
    comebackMultiplier,
    comebackBonus,
    comebackApplied,
    totalXp:
      context.baseXp + streakBonus + balanceBonus + comebackBonus,
  };
};

export const calculateAdaptiveXp = async (
  userId: string,
  activityType: ActivityType,
  completedAt = new Date(),
): Promise<XpBreakdown> => {
  const balanceWindowStart = new Date(
    completedAt.getTime() - BALANCE_WINDOW_DAYS * DAY_IN_MS,
  );

  const [streak, latestActivity, categoryGroups] = await Promise.all([
    prisma.streak.findUnique({
      where: { userId_type: { userId, type: 'daily' } },
      select: { currentCount: true, lastActivityDate: true },
    }),
    prisma.activity.findFirst({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    }),
    prisma.activity.groupBy({
      by: ['type'],
      where: {
        userId,
        type: { in: CORE_ACTIVITY_TYPES },
        completedAt: { gte: balanceWindowStart, lt: completedAt },
      },
      _count: { _all: true },
    }),
  ]);

  const recentCategoryCounts = categoryGroups.reduce<
    Partial<Record<ActivityType, number>>
  >((counts, group) => {
    counts[group.type] = group._count._all;
    return counts;
  }, {});

  return calculateXpBreakdown({
    activityType,
    baseXp: XP_PER_ACTIVITY[activityType] ?? 30,
    projectedStreak: getProjectedStreak(
      streak?.currentCount ?? 0,
      streak?.lastActivityDate ?? null,
      completedAt,
    ),
    recentCategoryCounts,
    inactiveForMs: latestActivity
      ? completedAt.getTime() - latestActivity.completedAt.getTime()
      : null,
  });
};
