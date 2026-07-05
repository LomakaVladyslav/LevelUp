import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/auth/login';
import RegisterScreen from '../app/auth/register';
import HomeScreen from '../app/(tabs)/index';
import ActivitiesScreen from '../app/(tabs)/activities';
import { activityService } from '../services/activity.service';
import { authService } from '../services/auth.service';
import { plannedActivityService } from '../services/plannedActivity.service';
import { recommendationService } from '../services/recommendation.service';
import { statsService } from '../services/stats.service';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import type { ActivityResult, PlannedActivity } from '../types';

jest.mock('../services/activity.service', () => ({
  activityService: {
    getAll: jest.fn(),
  },
}));

jest.mock('../services/auth.service', () => ({
  authService: {
    availability: jest.fn(),
    forgotPassword: jest.fn(),
    getMe: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

jest.mock('../services/plannedActivity.service', () => ({
  plannedActivityService: {
    complete: jest.fn(),
    getAll: jest.fn(),
  },
}));

jest.mock('../services/recommendation.service', () => ({
  recommendationService: {
    getAll: jest.fn(),
  },
}));

jest.mock('../services/stats.service', () => ({
  statsService: {
    getOverview: jest.fn(),
  },
}));

beforeEach(() => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    username: 'tester',
    xp: 0,
    level: 1,
  };

  useAuthStore.setState({
    token: 'token-1',
    user,
    isLoading: false,
  });
  useSettingsStore.setState({
    language: 'en',
    themeMode: 'light',
    settingsLoaded: true,
    notificationsEnabled: false,
  });
  jest.mocked(authService.getMe).mockResolvedValue(user);
});

const plannedActivity: PlannedActivity = {
  id: 'planned-1',
  userId: 'user-1',
  type: 'STUDY',
  title: 'Read TypeScript',
  description: null,
  motivationText: null,
  displayTitle: 'Read TypeScript',
  displayDescription: null,
  displayMotivationText: null,
  scheduleType: 'SIMPLE',
  dueDate: null,
  dueTimeMinutes: null,
  timezone: 'UTC',
  status: 'ACTIVE',
  completedAt: null,
  disabledAt: null,
  createdAt: '2026-06-25T09:00:00.000Z',
  updatedAt: '2026-06-25T09:00:00.000Z',
  isCompletedToday: false,
  completedTodayAt: null,
  streakDays: 0,
};

const completionResult: ActivityResult = {
  activity: {
    id: 'activity-1',
    userId: 'user-1',
    type: 'STUDY',
    title: 'Read TypeScript',
    description: null,
    displayTitle: 'Read TypeScript',
    displayDescription: null,
    xpEarned: 30,
    duration: null,
    plannedActivityId: 'planned-1',
    completedForDate: '2026-06-25',
    completedAt: '2026-06-25T09:10:00.000Z',
  },
  xpGained: 30,
  xpBreakdown: {
    baseXp: 30,
    streakDays: 1,
    streakMultiplier: 1,
    streakBonus: 0,
    balanceMultiplier: 1,
    balanceBonus: 0,
    balanceApplied: false,
    comebackMultiplier: 1,
    comebackBonus: 0,
    comebackApplied: false,
    totalXp: 30,
  },
  levelUp: false,
  newLevel: 1,
  streak: {
    current: 1,
    longest: 1,
    isNewRecord: false,
  },
  newAchievements: [],
};

test('login screen renders the default login state', () => {
  render(<LoginScreen />);

  expect(screen.getByText('LevelUp')).toBeTruthy();
  expect(screen.getByText('Log In')).toBeTruthy();
  expect(screen.getByText('Forgot password?')).toBeTruthy();
});

test('login screen shows invalid credentials inline', async () => {
  jest.mocked(authService.login).mockRejectedValue({
    response: { data: { errorCode: 'AUTH_INVALID_CREDENTIALS' } },
  });

  render(<LoginScreen />);

  fireEvent.changeText(screen.getByPlaceholderText('Email'), 'user@example.com');
  fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong-pass');
  fireEvent.press(screen.getByText('Log In'));

  await waitFor(() => {
    expect(screen.getByText('Invalid email or password')).toBeTruthy();
  });
});

test('register screen validates short passwords inline', () => {
  render(<RegisterScreen />);

  fireEvent.changeText(
    screen.getByPlaceholderText('Password (min 6 characters)'),
    '123',
  );

  expect(screen.getByText('Password must be at least 6 characters')).toBeTruthy();
});

test('register screen displays email availability errors', async () => {
  jest.mocked(authService.availability).mockImplementation(async (params) =>
    params.email
      ? { emailAvailable: false }
      : { usernameAvailable: true },
  );

  render(<RegisterScreen />);

  fireEvent.changeText(screen.getByPlaceholderText('Email'), 'used@example.com');
  fireEvent.changeText(screen.getByPlaceholderText('Username'), 'new-user');
  fireEvent.changeText(
    screen.getByPlaceholderText('Password (min 6 characters)'),
    'secret1',
  );
  fireEvent.press(screen.getByText('Next'));

  await waitFor(() => {
    expect(screen.getByText('This email address is already in use')).toBeTruthy();
  });
});

test('home screen renders empty activity state after loading dashboard data', async () => {
  jest.mocked(statsService.getOverview).mockResolvedValue({
    user: {
      id: 'user-1',
      username: 'tester',
      level: 1,
      totalXp: 0,
      xpProgress: { current: 0, required: 100, percentage: 0 },
    },
    streak: { current: 0, longest: 0 },
    totalActivities: 0,
    unlockedAchievements: 0,
  });
  jest.mocked(activityService.getAll).mockResolvedValue({
    activities: [],
    pagination: { total: 0, totalPages: 0, page: 1 },
  });
  jest.mocked(recommendationService.getAll).mockResolvedValue([]);

  render(<HomeScreen />);

  await waitFor(() => {
    expect(
      screen.getByText('No activities yet. Go to the Log tab to get started!'),
    ).toBeTruthy();
  });
});

test('activities screen renders empty planned activity state after loading', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({
    plannedActivities: [],
    todayProgress: { completed: 0, total: 0, percentage: 0 },
  });

  render(<ActivitiesScreen />);

  await waitFor(() => {
    expect(
      screen.getByText('No planned activities yet. Create one to start.'),
    ).toBeTruthy();
  });
});

test('activities create modal does not show the star badge text field', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({
    plannedActivities: [],
    todayProgress: { completed: 0, total: 0, percentage: 0 },
  });

  render(<ActivitiesScreen />);

  await waitFor(() => {
    expect(screen.getByText('Create activity')).toBeTruthy();
  });

  fireEvent.press(screen.getByText('Create activity'));

  await waitFor(() => {
    expect(screen.getByText('Type')).toBeTruthy();
  });
  expect(screen.queryByText('Star badge text')).toBeNull();
  expect(screen.queryByPlaceholderText('Example: 20 focused minutes')).toBeNull();
});

test('activities screen shows celebration after completing an activity', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({
    plannedActivities: [plannedActivity],
    todayProgress: { completed: 0, total: 1, percentage: 0 },
  });
  jest.mocked(plannedActivityService.complete).mockResolvedValue(completionResult);

  render(<ActivitiesScreen />);

  await waitFor(() => {
    expect(screen.getByText('Read TypeScript')).toBeTruthy();
  });

  fireEvent.press(screen.getByText('Complete'));

  await waitFor(() => {
    expect(plannedActivityService.complete).toHaveBeenCalledWith('planned-1');
  });
  await waitFor(() => {
    expect(screen.getByTestId('completion-celebration')).toBeTruthy();
  });
});
