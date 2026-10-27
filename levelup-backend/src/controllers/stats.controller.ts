import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { activeStreakCount } from '../services/streak.service';
import { dateKeyInTimezone, dateFromKey, getRequestTimezone } from '../services/planned-activity-metrics.service';
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
      await prisma.$transaction([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.activity.count({ where: { userId } }),
        prisma.streak.findUnique({
          where: { userId_type: { userId, type: 'daily' } },
        }),
        prisma.userAchievement.count({ where: { userId } }),
      ], { isolationLevel: 'RepeatableRead' });

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
        current: activeStreakCount(streak, new Date(), getRequestTimezone(req)),
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

    const timezone = getRequestTimezone(req);
    const now = new Date();
    const today = dateFromKey(dateKeyInTimezone(now, timezone));
    const firstDay = new Date(today.getTime() - 6 * 86400000);
    const range = { gte: new Date(firstDay.getTime() - 86400000), lte: now };
    const [activities, rewards] = await prisma.$transaction([
      prisma.activity.findMany({ where: { userId, completedAt: range }, select: { completedAt: true } }),
      prisma.xpHistory.findMany({ where: { userId, createdAt: range }, select: { createdAt: true, amount: true } }),
    ], { isolationLevel: 'RepeatableRead' });
    const dayMap: Record<string, { count: number; xpEarned: number }> = {};
    for (let i = 0; i < 7; i++) {
      const key = new Date(firstDay.getTime() + i * 86400000).toISOString().slice(0, 10);
      dayMap[key] = { count: 0, xpEarned: 0 };
    }
    for (const activity of activities) {
      const day = dayMap[dateKeyInTimezone(activity.completedAt, timezone)];
      if (day) day.count += 1;
    }
    for (const reward of rewards) {
      const day = dayMap[dateKeyInTimezone(reward.createdAt, timezone)];
      if (day) day.xpEarned += reward.amount;
    }
    const chartData = Object.entries(dayMap).map(([date, data]) => ({ date, ...data }));

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
      select: { createdAt: true, amount: true },
    });

    // Group by day and sum XP
    const dayMap: Record<string, number> = {};
    const timezone = getRequestTimezone(req);
    for (const entry of history) {
      const key = dateKeyInTimezone(entry.createdAt, timezone);
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
