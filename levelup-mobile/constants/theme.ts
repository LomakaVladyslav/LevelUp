export const colors = {
  // Brand
  primary: '#6C47FF',       // purple — main brand color
  primaryLight: '#EDE9FF',
  primaryDark: '#4B2FCC',

  // Semantic
  xpGold: '#F5A623',        // XP and level up color
  streakFire: '#FF6B35',    // streak color
  success: '#34C759',
  danger: '#FF3B30',

  // Activity types
  study: '#5B8DEF',
  workout: '#FF6B35',
  habit: '#34C759',
  custom: '#AF52DE',

  // Neutrals
  background: '#F8F7FF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F2F2F7',
  border: '#E5E5EA',

  // Text
  textPrimary: '#1C1C1E',
  textSecondary: '#6D6D72',
  textMuted: '#AEAEB2',
  textOnPrimary: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  tiny: { fontSize: 12, fontWeight: '400' as const },
};

// Map activity type to color
export const activityColor: Record<string, string> = {
  STUDY: colors.study,
  WORKOUT: colors.workout,
  HABIT: colors.habit,
  CUSTOM: colors.custom,
};

export const activityEmoji: Record<string, string> = {
  STUDY: '📚',
  WORKOUT: '💪',
  HABIT: '✅',
  CUSTOM: '⚡',
};
