// How much XP each activity type gives
export const XP_PER_ACTIVITY: Record<string, number> = {
  STUDY: 50,
  WORKOUT: 40,
  HABIT: 20,
  CUSTOM: 30,
};

// How much total XP is needed to reach a given level
// Level 1→2 needs 100 XP, Level 2→3 needs 200 XP, etc.
// Formula: level * 100  (gets harder as you go up)
export const xpRequiredForLevel = (level: number): number => level * 100;

// Given total XP, what level is the user?
export const levelFromXp = (totalXp: number): number => {
  let level = 1;
  let xpSpent = 0;

  while (xpSpent + xpRequiredForLevel(level) <= totalXp) {
    xpSpent += xpRequiredForLevel(level);
    level++;
  }

  return level;
};

// How much XP the user has within their current level (for the progress bar)
export const xpProgressInCurrentLevel = (
  totalXp: number
): { current: number; required: number; percentage: number } => {
  let level = 1;
  let xpSpent = 0;

  while (xpSpent + xpRequiredForLevel(level) <= totalXp) {
    xpSpent += xpRequiredForLevel(level);
    level++;
  }

  const current = totalXp - xpSpent;
  const required = xpRequiredForLevel(level);
  const percentage = Math.round((current / required) * 100);

  return { current, required, percentage };
};
