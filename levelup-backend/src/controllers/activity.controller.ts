import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { awardXP } from '../services/xp.service';
import { updateStreak } from '../services/streak.service';
import { checkAndUnlockAchievements } from '../services/achievement.service';
import { calculateAdaptiveXp } from '../services/adaptive-xp.service';
import { localizeActivities } from '../services/content-translation.service';
import { getRequestLocale } from '../utils/locale';

// POST /api/activities
// This is the most important endpoint — it's the core game loop
export const createActivity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;
    const locale = getRequestLocale(req);
    const { type, title, description, duration } = req.body;

    if (!type || !title) {
      res.status(400).json({ error: 'Type and title are required' });
      return;
    }

    const validTypes = ['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const completedAt = new Date();
    const xpBreakdown = await calculateAdaptiveXp(userId, type, completedAt);
    const xpEarned = xpBreakdown.totalXp;

    // Step 1: Save the activity to the database
    const activity = await prisma.activity.create({
      data: {
        userId,
        type,
        title,
        description,
        duration,
        xpEarned,
        completedAt,
      },
    });

    // Step 2: Award XP and check for level up
    const xpResult = await awardXP(userId, xpEarned, 'activity_completed');

    // Step 3: Update the daily streak
    const streakResult = await updateStreak(userId);

    // Step 4: Check if any achievements were unlocked
    const newAchievements = await checkAndUnlockAchievements(userId, locale);
    const [localizedActivity] = await localizeActivities(
      [{ ...activity, translations: [] }],
      locale,
    );

    // Step 5: Return everything in one response
    // The mobile app uses this to show celebration animations
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
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/activities
export const getActivities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;
    const locale = getRequestLocale(req);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { userId },
        include: { translations: true },
        orderBy: { completedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activity.count({ where: { userId } }),
    ]);

    res.json({
      activities: await localizeActivities(activities, locale),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/activities/:id
export const getActivityById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const activity = await prisma.activity.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { translations: true },
    });

    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    const [localizedActivity] = await localizeActivities([activity], locale);
    res.json({ activity: localizedActivity });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/activities/:id
export const deleteActivity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const activity = await prisma.activity.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    await prisma.activity.delete({ where: { id: req.params.id } });
    res.json({ message: 'Activity deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
