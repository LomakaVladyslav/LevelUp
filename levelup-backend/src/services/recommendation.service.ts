import { ActivityType } from '@prisma/client';
import prisma from '../utils/prisma';
import { xpProgressInCurrentLevel } from '../utils/constants';

const CORE_ACTIVITY_TYPES: ActivityType[] = ['STUDY', 'WORKOUT', 'HABIT'];
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MIN_CATEGORY_SAMPLE_SIZE = 4;

export type RecommendationCode =
  | 'MAINTAIN_STREAK'
  | 'CATEGORY_UNDERREPRESENTED'
  | 'LEVEL_ALMOST_REACHED'
  | 'PRODUCTIVITY_DECREASED'
  | 'CONSISTENCY'
  | 'PRODUCTIVITY_IMPROVED'
  | 'START_TODAY';

export interface Recommendation {
  id: string;
  code: RecommendationCode;
  message: string;
  metadata: Record<string, string | number>;
}

const startOfLocalDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const calendarDayDifference = (later: Date, earlier: Date): number =>
  Math.round(
    (startOfLocalDay(later).getTime() -
      startOfLocalDay(earlier).getTime()) /
      DAY_IN_MS,
  );

const categoryLabel = (type: ActivityType): string =>
  type.charAt(0) + type.slice(1).toLowerCase();

export const generateRecommendations = async (
  userId: string,
  now = new Date(),
): Promise<Recommendation[]> => {
  const currentPeriodStart = new Date(now.getTime() - 7 * DAY_IN_MS);
  const previousPeriodStart = new Date(now.getTime() - 14 * DAY_IN_MS);

  const [user, streak, activities] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true },
    }),
    prisma.streak.findUnique({
      where: { userId_type: { userId, type: 'daily' } },
      select: { currentCount: true, lastActivityDate: true },
    }),
    prisma.activity.findMany({
      where: {
        userId,
        completedAt: { gte: previousPeriodStart, lte: now },
      },
      select: { type: true, completedAt: true },
    }),
  ]);

  if (!user) return [];

  const currentActivities = activities.filter(
    (activity) => activity.completedAt >= currentPeriodStart,
  );
  const previousActivities = activities.filter(
    (activity) => activity.completedAt < currentPeriodStart,
  );
  const completedToday = currentActivities.some(
    (activity) => calendarDayDifference(now, activity.completedAt) === 0,
  );

  const daysSinceStreakActivity = streak?.lastActivityDate
    ? calendarDayDifference(now, streak.lastActivityDate)
    : null;
  const activeStreak =
    daysSinceStreakActivity !== null && daysSinceStreakActivity <= 1
      ? streak?.currentCount ?? 0
      : 0;

  const recommendations: Recommendation[] = [];

  if (activeStreak > 0 && !completedToday) {
    recommendations.push({
      id: 'maintain-streak',
      code: 'MAINTAIN_STREAK',
      message: `Complete one activity today to maintain your ${activeStreak}-day streak.`,
      metadata: { streak: activeStreak },
    });
  }

  if (
    previousActivities.length >= 3 &&
    currentActivities.length < previousActivities.length * 0.75
  ) {
    recommendations.push({
      id: 'productivity-decreased',
      code: 'PRODUCTIVITY_DECREASED',
      message: 'Your productivity has decreased compared with the previous week.',
      metadata: {
        currentCount: currentActivities.length,
        previousCount: previousActivities.length,
      },
    });
  }

  const categoryCounts = CORE_ACTIVITY_TYPES.reduce<
    Record<string, number>
  >((counts, type) => {
    counts[type] = currentActivities.filter(
      (activity) => activity.type === type,
    ).length;
    return counts;
  }, {});
  const totalCoreActivities = Object.values(categoryCounts).reduce(
    (total, count) => total + count,
    0,
  );

  if (totalCoreActivities >= MIN_CATEGORY_SAMPLE_SIZE) {
    const underrepresentedCategory = [...CORE_ACTIVITY_TYPES]
      .sort((first, second) => categoryCounts[first] - categoryCounts[second])
      .find(
        (type) => categoryCounts[type] / totalCoreActivities < 0.2,
      );

    if (underrepresentedCategory) {
      const label = categoryLabel(underrepresentedCategory);
      recommendations.push({
        id: `category-${underrepresentedCategory.toLowerCase()}`,
        code: 'CATEGORY_UNDERREPRESENTED',
        message: `${label} activities are underrepresented this week.`,
        metadata: { category: underrepresentedCategory },
      });
    }
  }

  const xpProgress = xpProgressInCurrentLevel(user.xp);
  if (xpProgress.percentage >= 80) {
    const xpRemaining = xpProgress.required - xpProgress.current;
    recommendations.push({
      id: 'level-almost-reached',
      code: 'LEVEL_ALMOST_REACHED',
      message: `You are only ${xpRemaining} XP away from the next level.`,
      metadata: { xpRemaining },
    });
  }

  if (activeStreak >= 7 && completedToday) {
    recommendations.push({
      id: 'consistency',
      code: 'CONSISTENCY',
      message: `Great consistency. Keep your ${activeStreak}-day streak going.`,
      metadata: { streak: activeStreak },
    });
  }

  if (
    currentActivities.length >= 3 &&
    currentActivities.length > previousActivities.length
  ) {
    recommendations.push({
      id: 'productivity-improved',
      code: 'PRODUCTIVITY_IMPROVED',
      message: 'Your productivity has improved compared with the previous week.',
      metadata: {
        currentCount: currentActivities.length,
        previousCount: previousActivities.length,
      },
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'start-today',
      code: 'START_TODAY',
      message: 'Complete one activity today to build momentum.',
      metadata: {},
    });
  }

  return recommendations.slice(0, 3);
};
