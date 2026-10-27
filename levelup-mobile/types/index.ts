export interface User {
  id: string;
  email: string;
  username: string;
  xp: number;
  level: number;
  avatarUrl?: string | null;
  age?: number | null;
}

export interface Activity {
  id: string;
  userId: string;
  type: ActivityType;
  title: string;
  description?: string | null;
  displayTitle: string;
  displayDescription?: string | null;
  xpEarned: number;
  duration?: number | null;
  plannedActivityId?: string | null;
  completedForDate?: string | null;
  completedAt: string;
}

export type ActivityType = 'STUDY' | 'WORKOUT' | 'HABIT' | 'CUSTOM';
export type PlannedActivityScheduleType = 'SIMPLE' | 'DAILY' | 'DATE';
export type PlannedActivityStatus = 'ACTIVE' | 'COMPLETED' | 'DISABLED';

export interface PlannedActivity {
  id: string;
  userId: string;
  type: ActivityType;
  title: string;
  description?: string | null;
  motivationText?: string | null;
  displayTitle: string;
  displayDescription?: string | null;
  displayMotivationText?: string | null;
  scheduleType: PlannedActivityScheduleType;
  dueDate?: string | null;
  dueTimeMinutes?: number | null;
  timezone: string;
  status: PlannedActivityStatus;
  completedAt?: string | null;
  disabledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isCompletedToday?: boolean;
  completedTodayAt?: string | null;
  streakDays?: number | null;
}

export interface TodayProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface PlannedActivityInput {
  type: ActivityType;
  title: string;
  description?: string | null;
  motivationText?: string | null;
  scheduleType: PlannedActivityScheduleType;
  dueDate?: string | null;
  dueTimeMinutes?: number | null;
  timezone?: string;
}

export interface PlannedActivityUpdateInput extends Partial<PlannedActivityInput> {
  status?: 'ACTIVE' | 'DISABLED';
  updatedAt?: string;
}

export interface SuggestedActivity extends PlannedActivityInput {
  description: string | null;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  iconEmoji: string;
  xpReward: number;
  condition: string;
  isUnlocked?: boolean;
  unlockedAt?: string | null;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  targetCount: number;
  currentCount: number;
  type: ActivityType;
  deadline?: string | null;
  isCompleted: boolean;
  createdAt: string;
}

export interface StatsOverview {
  user: {
    id: string;
    username: string;
    level: number;
    totalXp: number;
    xpProgress: {
      current: number;
      required: number;
      percentage: number;
    };
  };
  streak: {
    current: number;
    longest: number;
  };
  totalActivities: number;
  unlockedAchievements: number;
}

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

// What the POST /activities endpoint returns
export interface ActivityResult {
  activity: Activity;
  xpGained: number;
  totalXp?: number;
  achievementXpGained?: number;
  xpBreakdown: {
    baseXp: number;
    streakDays: number;
    streakMultiplier: number;
    streakBonus: number;
    balanceMultiplier: number;
    balanceBonus: number;
    balanceApplied: boolean;
    comebackMultiplier: number;
    comebackBonus: number;
    comebackApplied: boolean;
    totalXp: number;
  };
  levelUp: boolean;
  newLevel: number;
  streak: {
    current: number;
    longest: number;
    isNewRecord: boolean;
  };
  newAchievements: Achievement[];
}
