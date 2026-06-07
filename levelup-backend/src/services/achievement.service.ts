import prisma from '../utils/prisma';
import { levelFromXp } from '../utils/constants';
import { awardXP } from './xp.service';
import { localizeAchievement } from './achievement-localization.service';
import { SupportedLocale } from '../utils/locale';

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  iconEmoji: string;
  xpReward: number;
  condition: string;
}

export interface AchievementMetrics {
  totalActivities: number;
  activityCounts: Record<string, number>;
  streakDays: number;
  level: number;
  totalXp: number;
}

export const isAchievementConditionMet = (
  condition: string,
  metrics: AchievementMetrics,
): boolean => {
  const [metric, valueStr] = condition.split(':');
  const required = Number.parseInt(valueStr, 10);

  if (!Number.isFinite(required)) return false;

  switch (metric) {
    case 'activities_count':
      return metrics.totalActivities >= required;
    case 'study_count':
      return (metrics.activityCounts.STUDY ?? 0) >= required;
    case 'workout_count':
      return (metrics.activityCounts.WORKOUT ?? 0) >= required;
    case 'habit_count':
      return (metrics.activityCounts.HABIT ?? 0) >= required;
    case 'streak_days':
      return metrics.streakDays >= required;
    case 'level_reached':
      return metrics.level >= required;
    case 'xp_reached':
      return metrics.totalXp >= required;
    default:
      return false;
  }
};

export async function checkAndUnlockAchievements(
  userId: string,
  locale: SupportedLocale = 'en',
): Promise<Achievement[]> {
  const [
    allAchievements,
    userAchievements,
    activityGroups,
    streak,
    user,
  ] = await Promise.all([
    prisma.achievement.findMany({
      include: {
        translations: {
          where: { locale: { in: [locale, 'en'] } },
        },
      },
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    }),
    prisma.activity.groupBy({
      by: ['type'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.streak.findUnique({
      where: { userId_type: { userId, type: 'daily' } },
      select: { currentCount: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { level: true, xp: true },
    }),
  ]);

  if (!user) return [];

  const activityCounts = activityGroups.reduce<Record<string, number>>(
    (counts, group) => {
      counts[group.type] = group._count._all;
      return counts;
    },
    {},
  );
  const metrics: AchievementMetrics = {
    totalActivities: Object.values(activityCounts).reduce(
      (total, count) => total + count,
      0,
    ),
    activityCounts,
    streakDays: streak?.currentCount ?? 0,
    level: user.level,
    totalXp: user.xp,
  };
  const alreadyUnlockedIds = new Set(
    userAchievements.map((achievement) => achievement.achievementId),
  );
  const newlyUnlocked: Achievement[] = [];
  let unlockedInPass: boolean;

  do {
    unlockedInPass = false;

    for (const achievement of allAchievements) {
      if (
        alreadyUnlockedIds.has(achievement.id) ||
        !isAchievementConditionMet(achievement.condition, metrics)
      ) {
        continue;
      }

      const result = await prisma.userAchievement.createMany({
        data: [{ userId, achievementId: achievement.id }],
        skipDuplicates: true,
      });

      alreadyUnlockedIds.add(achievement.id);
      if (result.count === 0) continue;

      if (achievement.xpReward > 0) {
        await awardXP(userId, achievement.xpReward, 'achievement_unlocked');
        metrics.totalXp += achievement.xpReward;
        metrics.level = levelFromXp(metrics.totalXp);
      }

      newlyUnlocked.push(localizeAchievement(achievement, locale));
      unlockedInPass = true;
    }
  } while (unlockedInPass);

  return newlyUnlocked;
}
