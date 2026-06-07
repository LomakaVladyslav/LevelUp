import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { xpProgressInCurrentLevel } from '../utils/constants';

// GET /api/stats/overview
// Main dashboard data: level, XP bar, streak, totals
export const getOverview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;

    const [user, totalActivities, streak, unlockedAchievements] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.activity.count({ where: { userId } }),
        prisma.streak.findUnique({
          where: { userId_type: { userId, type: 'daily' } },
        }),
        prisma.userAchievement.count({ where: { userId } }),
      ]);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const xpProgress = xpProgressInCurrentLevel(user.xp);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        level: user.level,
        totalXp: user.xp,
        xpProgress,
      },
      streak: {
        current: streak?.currentCount ?? 0,
        longest: streak?.longestCount ?? 0,
      },
      totalActivities,
      unlockedAchievements,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/stats/weekly
// Last 7 days of activities — used for the bar chart
export const getWeeklyStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const activities = await prisma.activity.findMany({
      where: { userId, completedAt: { gte: sevenDaysAgo } },
      orderBy: { completedAt: 'asc' },
    });

    // Group by day for the chart
    const dayMap: Record<string, { count: number; xpEarned: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0]; // "2024-01-15"
      dayMap[key] = { count: 0, xpEarned: 0 };
    }

    for (const activity of activities) {
      const key = activity.completedAt.toISOString().split('T')[0];
      if (dayMap[key]) {
        dayMap[key].count += 1;
        dayMap[key].xpEarned += activity.xpEarned;
      }
    }

    const chartData = Object.entries(dayMap).map(([date, data]) => ({
      date,
      ...data,
    }));

    res.json({ chartData });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/stats/xp-history
// XP earned per day — used for the line chart
export const getXpHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await prisma.xpHistory.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day and sum XP
    const dayMap: Record<string, number> = {};
    for (const entry of history) {
      const key = entry.createdAt.toISOString().split('T')[0];
      dayMap[key] = (dayMap[key] ?? 0) + entry.amount;
    }

    const chartData = Object.entries(dayMap).map(([date, xp]) => ({
      date,
      xp,
    }));

    res.json({ chartData });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
