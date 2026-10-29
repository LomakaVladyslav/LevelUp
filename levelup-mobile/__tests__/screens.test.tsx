import SettingsScreen from '../app/(tabs)/settings';
import ActivityHistoryScreen from '../app/(tabs)/activity-history';
import { apiContext } from '../services/api-context';
import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/auth/login';
import RegisterScreen from '../app/auth/register';
import StatsScreen from '../app/(tabs)/stats';
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
    updateMe: jest.fn(),
    deleteMe: jest.fn(),
  },
}));

jest.mock('../services/plannedActivity.service', () => ({
  plannedActivityService: {
    complete: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
    getWeekly: jest.fn(),
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
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(statsService.getOverview).mockResolvedValue({ user: { id: user.id, username: user.username, level: 1, totalXp: 0, xpProgress: { current: 0, required: 100, percentage: 0 } }, streak: { current: 0, longest: 0 }, totalActivities: 0, unlockedAchievements: 0 });
  jest.mocked(activityService.getAll).mockResolvedValue({ activities: [], pagination: { total: 0, totalPages: 0, page: 1 } });
  jest.mocked(recommendationService.getAll).mockResolvedValue([]);
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [], todayProgress: { completed: 0, total: 0, percentage: 0 } });
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

test('login screen renders the default login state', async () => {
  await render(<LoginScreen />);

  expect(screen.getByText('LevelUp')).toBeTruthy();
  expect(screen.getByText('Log In')).toBeTruthy();
  expect(screen.getByText('Forgot password?')).toBeTruthy();
});

test('login screen shows invalid credentials inline', async () => {
  jest.mocked(authService.login).mockRejectedValue({
    response: { data: { errorCode: 'AUTH_INVALID_CREDENTIALS' } },
  });

  await render(<LoginScreen />);

  await fireEvent.changeText(
    screen.getByPlaceholderText('Email'),
    'user@example.com',
  );
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong-pass');
  await fireEvent.press(screen.getByText('Log In'));

  await waitFor(() => {
    expect(screen.getByText('Invalid email or password')).toBeTruthy();
  });
});

test('register screen validates short passwords inline', async () => {
  await render(<RegisterScreen />);

  await fireEvent.changeText(
    screen.getByPlaceholderText('Password (min 6 characters)'),
    '123',
  );

  expect(screen.getByText('Password must be at least 6 characters')).toBeTruthy();
});

test('registration shows an atomic server uniqueness error inline', async () => {
  jest.mocked(authService.register).mockRejectedValue({ response: { data: { errorCode: 'AUTH_EMAIL_IN_USE' } } });

  await render(<RegisterScreen />);

  await fireEvent.changeText(
    screen.getByPlaceholderText('Email'),
    'used@example.com',
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText('Username'),
    'new-user',
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText('Password (min 6 characters)'),
    'secret1',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Create Account' }));

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

  await render(<HomeScreen />);

  await waitFor(() => {
    expect(
      screen.getByText('Completed tasks and earned XP will appear here.'),
    ).toBeTruthy();
  });
});

test('activities screen renders empty planned activity state after loading', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({
    plannedActivities: [],
    todayProgress: { completed: 0, total: 0, percentage: 0 },
  });

  await render(<ActivitiesScreen />);

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

  await render(<ActivitiesScreen />);

  await waitFor(() => {
    expect(screen.getByText('Create activity')).toBeTruthy();
  });

  await fireEvent.press(screen.getByText('Create activity'));

  await waitFor(() => {
    expect(screen.getByText('Category (optional)')).toBeTruthy();
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

  await render(<ActivitiesScreen />);

  await waitFor(() => {
    expect(screen.getByText('Read TypeScript')).toBeTruthy();
  });

  await fireEvent.press(screen.getByText('Complete'));

  await waitFor(() => {
    expect(plannedActivityService.complete).toHaveBeenCalledWith('planned-1', undefined, plannedActivity.updatedAt);
  });
  await waitFor(() => {
    expect(screen.getByTestId('completion-celebration')).toBeTruthy();
  });
});

test('registration submits once from a single form without availability requests', async () => {
  jest.mocked(authService.register).mockReturnValue(new Promise(() => {}));
  await render(<RegisterScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'new@example.test');
  await fireEvent.changeText(screen.getByPlaceholderText('Username'), 'new-user');
  await fireEvent.changeText(screen.getByPlaceholderText('Password (min 6 characters)'), 'secret1');
  await fireEvent.press(screen.getByRole('button', { name: 'Create Account' }));
  await fireEvent(screen.getByPlaceholderText('Password (min 6 characters)'), 'submitEditing');
  expect(authService.register).toHaveBeenCalledTimes(1);
  expect(authService.availability).not.toHaveBeenCalled();
});


test('Home shows an actionable task while optional recommendations and progress are still loading', async () => {
  jest.mocked(recommendationService.getAll).mockReturnValue(new Promise(() => {}));
  jest.mocked(statsService.getOverview).mockReturnValue(new Promise(() => {}));
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await render(<HomeScreen />);
  await waitFor(() => expect(screen.getByText(/Read TypeScript/)).toBeTruthy());
  expect(screen.getByText('Complete')).toBeTruthy();
  await fireEvent.press(screen.getByText('+ Create activity'));
  expect(useRouter().navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/activities', params: { create: '1' } });
});

test('Home completion blocks duplicate taps, preserves the task on failure and retries successfully', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  let reject!: (error: unknown) => void;
  jest.mocked(plannedActivityService.complete).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  await render(<HomeScreen />);
  await fireEvent.press(screen.getByText('Complete'));
  await fireEvent.press(screen.getByText('Completing...'));
  expect(plannedActivityService.complete).toHaveBeenCalledTimes(1);
  await act(async () => reject({ message: 'Network Error' }));
  expect(screen.getByText(/Read TypeScript/)).toBeTruthy();
  expect(screen.getByText('Complete')).toBeTruthy();
  jest.mocked(plannedActivityService.complete).mockResolvedValue({ ...completionResult, totalXp: 90, achievementXpGained: 60 });
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await fireEvent.press(screen.getByText('Complete'));
  await waitFor(() => expect(authService.getMe).toHaveBeenCalled());
  expect(screen.getByTestId('completion-celebration')).toBeTruthy();
  expect(screen.queryByText('Complete')).toBeNull();
  alert.mockRestore();
});

test('Home create link opens a draft immediately even when the task list is slow', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ create: '1' });
  jest.mocked(plannedActivityService.getAll).mockReturnValue(new Promise(() => {}));
  await AsyncStorage.setItem('activityDraft:user-1', JSON.stringify({ title: 'Read one chapter', description: '', selectedType: 'STUDY', scheduleType: 'SIMPLE' }));
  await render(<ActivitiesScreen />);
  await waitFor(() => expect(screen.getByDisplayValue('Read one chapter')).toBeTruthy());
  expect(useRouter().setParams).toHaveBeenCalledWith({ create: undefined });
});

test('create keeps the draft after a failed save, then creates one task and clears the draft', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByText('Paused'));
  await fireEvent.press(screen.getByText('Create activity'));
  await waitFor(() => expect(screen.getByText('Save')).toBeTruthy());
  await fireEvent.changeText(screen.getByPlaceholderText('e.g. Read chapter 5, Morning run...'), 'Read TypeScript');
  jest.mocked(plannedActivityService.create).mockRejectedValueOnce({ message: 'Network Error' });
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(screen.getByDisplayValue('Read TypeScript')).toBeTruthy();
  expect(JSON.parse((await AsyncStorage.getItem('activityDraft:user-1'))!).title).toBe('Read TypeScript');
  jest.mocked(plannedActivityService.create).mockResolvedValue({ plannedActivity });
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(screen.queryByText('Save')).toBeNull());
  expect(screen.getByText(/Read TypeScript/)).toBeTruthy();
  await waitFor(async () => expect(await AsyncStorage.getItem('activityDraft:user-1')).toBeNull());
  alert.mockRestore();
});

test('registration accepts an omitted age', async () => {
  jest.mocked(authService.availability).mockResolvedValue({ emailAvailable: true, usernameAvailable: true });
  jest.mocked(authService.register).mockResolvedValue({ token: 'registered', user: useAuthStore.getState().user! });
  await render(<RegisterScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'new@example.test');
  await fireEvent.changeText(screen.getByPlaceholderText('Username'), 'new-user');
  await fireEvent.changeText(screen.getByPlaceholderText('Password (min 6 characters)'), 'secret1');
  await fireEvent.press(screen.getByRole('button', { name: 'Create Account' }));
  await waitFor(() => expect(authService.register).toHaveBeenCalledWith('new@example.test', 'new-user', 'secret1'));
});


test('Home offers one recovery action when both progress and tasks fail', async () => {
  jest.mocked(statsService.getOverview).mockRejectedValueOnce(new Error('Offline'));
  jest.mocked(plannedActivityService.getAll).mockRejectedValueOnce(new Error('Offline'));
  await render(<HomeScreen />);
  await waitFor(() => expect(screen.getAllByText('Retry')).toHaveLength(1));
  await fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(screen.queryByText('Retry')).toBeNull());
  expect(plannedActivityService.getAll).toHaveBeenCalledTimes(2);
  expect(statsService.getOverview).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Total XP: 0')).toBeTruthy();
});

test('progress clarifies its time period and includes direct routes to history and achievements', async () => {
  jest.mocked(statsService.getWeekly).mockResolvedValue([{ date: '2026-09-08', count: 2, xpEarned: 140 }]);
  await render(<StatsScreen />);
  expect(screen.getByText('Completed · 7 days')).toBeTruthy();
  expect(screen.getByText('XP includes task completions and achievement rewards.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Achievements'));
  expect(useRouter().navigate).toHaveBeenCalledWith('/(tabs)/achievements');
  await fireEvent.press(screen.getByText('Activity History'));
  expect(useRouter().navigate).toHaveBeenCalledWith('/(tabs)/activity-history');
});


test('task titles edit directly and the completed list has an explicit route', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByLabelText('Edit: Read TypeScript'));
  expect(screen.getByDisplayValue('Read TypeScript')).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancel'));
  await fireEvent.press(screen.getByText('Completed →'));
  expect(useRouter().navigate).toHaveBeenCalledWith('/(tabs)/activity-history');
});

test('empty history leads to tasks instead of a dead end', async () => {
  await render(<ActivityHistoryScreen />);
  await fireEvent.press(screen.getByText('All tasks'));
  expect(useRouter().navigate).toHaveBeenCalledWith('/(tabs)/activities');
});

test('settings does not collect age and preserves historical profile values', async () => {
  const previous = useAuthStore.getState().user!;
  useAuthStore.setState({ user: { ...previous, age: 25 } });
  await render(<SettingsScreen />);
  expect(screen.queryByLabelText('Age')).toBeNull();
  expect(authService.updateMe).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.age).toBe(25);
});

test('an account deletion confirmation cannot act on a different session', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Delete account'));
  const confirm = alert.mock.calls[0][2]![1].onPress!;
  apiContext.setToken('different-session', 'user-2');
  await act(async () => { confirm(); });
  expect(authService.deleteMe).not.toHaveBeenCalled();
  alert.mockRestore();
});


test('a paused daily task can resume even if it was completed earlier today', async () => {
  const paused: PlannedActivity = { ...plannedActivity, status: 'DISABLED', scheduleType: 'DAILY', isCompletedToday: true };
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [paused], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  jest.mocked(plannedActivityService.update).mockResolvedValue({ plannedActivity: { ...paused, status: 'ACTIVE' } });
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByText('Paused'));
  await fireEvent.press(screen.getByRole('button', { name: 'Resume: Read TypeScript' }));
  expect(plannedActivityService.update).toHaveBeenCalledWith(paused.id, { status: 'ACTIVE', updatedAt: paused.updatedAt });
  expect(plannedActivityService.complete).not.toHaveBeenCalled();
});


test('slow history never blocks Home XP and streak', async () => {
  jest.mocked(activityService.getAll).mockReturnValue(new Promise(() => {}));
  await render(<HomeScreen />);
  expect(screen.getByText('Total XP: 0')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Day streak' }).props.accessibilityValue).toEqual({ text: '0' });
  expect(screen.getByRole('button', { name: 'Progress' }).props.accessibilityValue).toEqual({ text: 'Level 1. Total XP: 0' });
});

test('a quick task needs only a title and defaults to the optional CUSTOM category', async () => {
  jest.mocked(plannedActivityService.create).mockResolvedValue({ plannedActivity: { ...plannedActivity, type: 'CUSTOM', title: 'Quick note' } });
  await render(<ActivitiesScreen />);
  await fireEvent.press(await screen.findByText('Create activity'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Quick note');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(plannedActivityService.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Quick note', type: 'CUSTOM', scheduleType: 'SIMPLE', dueDate: null, dueTimeMinutes: null })));
});
test('selected weekdays exposes the Monday-Friday preset without requiring a category', async () => {
  jest.mocked(plannedActivityService.create).mockResolvedValue({ plannedActivity: { ...plannedActivity, scheduleType: 'WEEKLY', weekdays: [1, 2, 3, 4, 5] } });
  await render(<ActivitiesScreen />);
  await fireEvent.press(await screen.findByText('Create activity'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Walk');
  await fireEvent.press(screen.getByText('Selected weekdays'));
  await fireEvent.press(screen.getByText('Monday–Friday'));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(plannedActivityService.create).toHaveBeenCalledWith(expect.objectContaining({ scheduleType: 'WEEKLY', weekdays: [1, 2, 3, 4, 5] })));
});
test('notification route opens the identified task rather than another list item', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ taskId: plannedActivity.id });
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await render(<ActivitiesScreen />);
  await waitFor(() => expect(screen.getByLabelText('Title').props.value).toBe(plannedActivity.title));
});
