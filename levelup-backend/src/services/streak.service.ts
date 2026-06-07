import prisma from '../utils/prisma';

export async function updateStreak(userId: string): Promise<{
  currentCount: number;
  longestCount: number;
  isNewRecord: boolean;
}> {
  // Get today at midnight (so we compare dates, not times)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Find or create the user's daily streak record
  let streak = await prisma.streak.findUnique({
    where: { userId_type: { userId, type: 'daily' } },
  });

  if (!streak) {
    // First ever activity — create streak starting at 1
    const newStreak = await prisma.streak.create({
      data: {
        userId,
        type: 'daily',
        currentCount: 1,
        longestCount: 1,
        lastActivityDate: today,
      },
    });
    return { currentCount: 1, longestCount: 1, isNewRecord: true };
  }

  const lastDate = streak.lastActivityDate
    ? new Date(streak.lastActivityDate)
    : null;

  if (lastDate) {
    lastDate.setHours(0, 0, 0, 0);
  }

  // Already logged today — don't double-count
  if (lastDate && lastDate.getTime() === today.getTime()) {
    return {
      currentCount: streak.currentCount,
      longestCount: streak.longestCount,
      isNewRecord: false,
    };
  }

  let newCount: number;

  if (lastDate && lastDate.getTime() === yesterday.getTime()) {
    // Consecutive day — continue the streak
    newCount = streak.currentCount + 1;
  } else {
    // Streak broken (gap of more than 1 day) — restart from 1
    newCount = 1;
  }

  const newLongest = Math.max(newCount, streak.longestCount);
  const isNewRecord = newLongest > streak.longestCount;

  await prisma.streak.update({
    where: { id: streak.id },
    data: {
      currentCount: newCount,
      longestCount: newLongest,
      lastActivityDate: today,
    },
  });

  return { currentCount: newCount, longestCount: newLongest, isNewRecord };
}
