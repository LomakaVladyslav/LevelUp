import { Prisma } from '@prisma/client';
import { dateFromKey, dateKeyInTimezone } from './planned-activity-metrics.service';

export function activeStreakCount(streak: { currentCount: number; lastActivityDate: Date | null } | null, now = new Date(), timezone = 'UTC'): number {
  if (!streak?.lastActivityDate) return 0;
  const today = dateFromKey(dateKeyInTimezone(now, timezone));
  const gap = (today.getTime() - streak.lastActivityDate.getTime()) / 86400000;
  return gap >= 0 && gap <= 1 ? streak.currentCount : 0;
}

export async function updateStreak(userId: string, db: Prisma.TransactionClient, completedAt = new Date(), timezone = 'UTC') {
  const today = dateFromKey(dateKeyInTimezone(completedAt, timezone));
  const streak = await db.streak.findUnique({ where: { userId_type: { userId, type: 'daily' } } });
  // A timezone change must not increment the same or an earlier calendar day.
  if (streak?.lastActivityDate && streak.lastActivityDate >= today) {
    return { currentCount: streak.currentCount, longestCount: streak.longestCount, isNewRecord: false };
  }
  const consecutive = streak?.lastActivityDate?.getTime() === today.getTime() - 86400000;
  const currentCount = consecutive ? streak!.currentCount + 1 : 1;
  const longestCount = Math.max(currentCount, streak?.longestCount ?? 0);
  await db.streak.upsert({
    where: { userId_type: { userId, type: 'daily' } },
    create: { userId, currentCount, longestCount, lastActivityDate: today },
    update: { currentCount, longestCount, lastActivityDate: today },
  });
  return { currentCount, longestCount, isNewRecord: longestCount > (streak?.longestCount ?? 0) };
}
