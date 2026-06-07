import prisma from '../utils/prisma';
import { levelFromXp } from '../utils/constants';

export async function awardXP(
  userId: string,
  amount: number,
  reason: string
): Promise<{ levelUp: boolean; newLevel: number; xpGained: number }> {
  // 1. Record this XP gain in history (useful for the stats chart)
  await prisma.xpHistory.create({
    data: { userId, amount, reason },
  });

  // 2. Add XP to the user's total
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
  });

  // 3. Recalculate what level the user should be at
  const correctLevel = levelFromXp(updatedUser.xp);
  const leveledUp = correctLevel > updatedUser.level;

  if (leveledUp) {
    await prisma.user.update({
      where: { id: userId },
      data: { level: correctLevel },
    });
  }

  return {
    levelUp: leveledUp,
    newLevel: leveledUp ? correctLevel : updatedUser.level,
    xpGained: amount,
  };
}
