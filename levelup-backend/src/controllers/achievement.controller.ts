import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { localizeAchievement } from '../services/achievement-localization.service';
import { getRequestLocale } from '../utils/locale';

// GET /api/achievements
// Returns all achievements with a flag showing if the user has unlocked each one
export const getAchievements = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;
    const locale = getRequestLocale(req);

    const [allAchievements, userAchievements] = await Promise.all([
      prisma.achievement.findMany({
        include: {
          translations: {
            where: { locale: { in: [locale, 'en'] } },
          },
        },
      }),
      prisma.userAchievement.findMany({
        where: { userId },
      }),
    ]);

    const unlockedMap = new Map(
      userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt])
    );

    const achievements = allAchievements.map((a) => ({
      ...localizeAchievement(a, locale),
      isUnlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id) ?? null,
    }));

    res.json({ achievements });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/achievements/unlocked
export const getUnlockedAchievements = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: req.user.id },
      include: {
        achievement: {
          include: {
            translations: {
              where: { locale: { in: [locale, 'en'] } },
            },
          },
        },
      },
      orderBy: { unlockedAt: 'desc' },
    });

    res.json({
      achievements: userAchievements.map((item) => ({
        ...item,
        achievement: localizeAchievement(item.achievement, locale),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
