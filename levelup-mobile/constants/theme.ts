const lightColors = {
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

  // Themed supporting colors
  overlay: 'rgba(0, 0, 0, 0.5)',
  modalOverlay: 'rgba(0,0,0,0.5)',
  levelTextMuted: 'rgba(255,255,255,0.8)',
  levelTrack: 'rgba(255,255,255,0.3)',
  cardBorder: '#E4F2E7',
  cardShadow: '#1F7A38',
  primaryShadow: '#40269A',
  successSurface: '#EAF9EE',
  successBorder: '#C9EFD3',
  successText: '#247A3B',
  starTile: '#9B7BFF',
};

export type ThemeColors = typeof lightColors;

const darkColors: ThemeColors = {
  // Brand
  primary: '#B8F21D',
  primaryLight: '#24330D',
  primaryDark: '#D4FF5A',

  // Semantic
  xpGold: '#F7C846',
  streakFire: '#FF7A45',
  success: '#8FDF76',
  danger: '#FF6B63',

  // Activity types
  study: '#7EA6FF',
  workout: '#FF8A5B',
  habit: '#8FDF76',
  custom: '#C78BFF',

  // Neutrals
  background: '#050506',
  surface: '#0D0E0B',
  surfaceSecondary: '#161812',
  border: '#303623',

  // Text
  textPrimary: '#F2F5EC',
  textSecondary: '#B4BBAA',
  textMuted: '#68705F',
  textOnPrimary: '#101304',

  // Themed supporting colors
  overlay: 'rgba(0, 0, 0, 0.72)',
  modalOverlay: 'rgba(0,0,0,0.72)',
  levelTextMuted: 'rgba(16,19,4,0.72)',
  levelTrack: 'rgba(16,19,4,0.22)',
  cardBorder: '#252C17',
  cardShadow: '#000000',
  primaryShadow: '#000000',
  successSurface: '#132616',
  successBorder: '#2F5D36',
  successText: '#9EF1A5',
  starTile: '#7EA315',
};

export type ThemeMode = 'light' | 'dark';
export type AppTheme = {
  mode: ThemeMode;
  colors: ThemeColors;
  activityColor: Record<string, string>;
};

const createActivityColor = (themeColors: ThemeColors): Record<string, string> => ({
  STUDY: themeColors.study,
  WORKOUT: themeColors.workout,
  HABIT: themeColors.habit,
  CUSTOM: themeColors.custom,
});

export const themes: Record<ThemeMode, AppTheme> = {
  light: {
    mode: 'light',
    colors: lightColors,
    activityColor: createActivityColor(lightColors),
  },
  dark: {
    mode: 'dark',
    colors: darkColors,
    activityColor: createActivityColor(darkColors),
  },
};

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark';

export const colors = themes.light.colors;

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

// Map activity type to color for light-theme static fallbacks.
export const activityColor = themes.light.activityColor;

export const activityEmoji: Record<string, string> = {
  STUDY: '📚',
  WORKOUT: '💪',
  HABIT: '✅',
  CUSTOM: '⚡',
};
