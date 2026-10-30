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
    undo: jest.fn(),
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

test('Today renders a calm empty state without KPI requests', async () => {
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
      screen.getByText('You’re all set for today'),
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
      screen.getByText('No matching tasks'),
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

  expect(screen.queryByText('Category (optional)')).toBeNull();
  await fireEvent.press(screen.getByText('More options'));
  expect(screen.getByText('Category (optional)')).toBeTruthy();
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
  await fireEvent.press(screen.getByText('Quick add'));
  expect(screen.getByLabelText('Title')).toBeTruthy();
  expect(useRouter().navigate).not.toHaveBeenCalled();
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
  expect(statsService.getOverview).not.toHaveBeenCalled();
  expect(screen.getByText('You’re all set for today')).toBeTruthy();
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


test('Today does not request history until Completed is expanded', async () => {
  await render(<HomeScreen />);
  expect(activityService.getAll).not.toHaveBeenCalled();
  expect(statsService.getOverview).not.toHaveBeenCalled();
  expect(recommendationService.getAll).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Completed today +'));
  await waitFor(() => expect(activityService.getAll).toHaveBeenCalledWith(1));
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
  await fireEvent.press(screen.getByText('More options'));
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

test('Today Quick Add saves today with title only and clears its draft', async () => {
  jest.mocked(plannedActivityService.create).mockResolvedValue({ plannedActivity: { ...plannedActivity, type: 'CUSTOM' } });
  await render(<HomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Quick add' }));
  expect(screen.queryByLabelText('Description (optional)')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Call mum');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(plannedActivityService.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call mum', type: 'CUSTOM', scheduleType: 'DATE', dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })));
  await waitFor(async () => expect(await AsyncStorage.getItem('activityDraft:user-1')).toBeNull());
});
test('Tasks search filters the loaded description without another API request', async () => {
  const other = { ...plannedActivity, id: 'other', title: 'Walk', displayTitle: 'Walk', description: 'Outside', scheduleType: 'DAILY' as const };
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [{ ...plannedActivity, description: 'Handbook' }, other], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await render(<ActivitiesScreen />);
  const reads = jest.mocked(plannedActivityService.getAll).mock.calls.length;
  await fireEvent.changeText(screen.getByLabelText('Search tasks'), 'handbook');
  expect(screen.getByText('Read TypeScript')).toBeTruthy();
  expect(screen.queryByText('Walk')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search tasks'), '');
  await fireEvent.press(screen.getByRole('tab', { name: 'Recurring' }));
  expect(screen.getByText('Walk')).toBeTruthy();
  expect(screen.queryByText('Read TypeScript')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'No date' }));
  expect(screen.getByText('Read TypeScript')).toBeTruthy();
  expect(screen.queryByText('Walk')).toBeNull();
  expect(plannedActivityService.getAll).toHaveBeenCalledTimes(reads);
});
test('edit draft survives closing and remounting, saves with optimistic version, and clears only that draft', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  const first = await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByLabelText('Edit: Read TypeScript'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Edited offline');
  await fireEvent.press(screen.getByText('Cancel'));
  await first.unmount();
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByLabelText('Edit: Read TypeScript'));
  await waitFor(() => expect(screen.getByDisplayValue('Edited offline')).toBeTruthy());
  expect(screen.getByText('Unsaved draft restored')).toBeTruthy();
  jest.mocked(plannedActivityService.update).mockResolvedValue({ plannedActivity: { ...plannedActivity, title: 'Edited offline' } });
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(plannedActivityService.update).toHaveBeenCalledWith(plannedActivity.id, expect.objectContaining({ title: 'Edited offline', updatedAt: plannedActivity.updatedAt })));
  await waitFor(async () => expect(await AsyncStorage.getItem('userData:user-1:draft:planned-1')).toBeNull());
});
test('restoring an edit draft preserves an explicitly cleared time', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [{ ...plannedActivity, scheduleType: 'DAILY', dueTimeMinutes: 600 }], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await AsyncStorage.setItem('userData:user-1:draft:planned-1', JSON.stringify({ title: 'No time', description: '', scheduleType: 'DAILY', dueTime: null }));
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByLabelText('Edit: Read TypeScript'));
  expect(screen.getByText('Pick time')).toBeTruthy();
  expect(screen.queryByText('Clear time')).toBeNull();
});
test('switching accounts closes private edit drafts and clears search', async () => {
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByLabelText('Edit: Read TypeScript'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Private unsaved text');
  jest.mocked(plannedActivityService.getAll).mockReturnValue(new Promise(() => {}));
  await act(() => {
    apiContext.setToken('new-token', 'second');
    useAuthStore.setState({ user: { id: 'second', username: 'Second', email: 'second@example.test', xp: 0, level: 1 } });
  });
  expect(screen.queryByDisplayValue('Private unsaved text')).toBeNull();
  expect(screen.queryByText('Read TypeScript')).toBeNull();
});
test('Today Completed exposes server Undo by completion ID and reloads after success', async () => {
  jest.mocked(activityService.getAll).mockResolvedValue({ activities: [{ ...completionResult.activity, completedAt: new Date().toISOString() }], pagination: { page: 1, totalPages: 1, total: 1 } });
  jest.mocked(activityService.undo).mockResolvedValue({ activityId: 'activity-1', undone: true, totalXp: 0, newLevel: 1 });
  await render(<HomeScreen />);
  await fireEvent.press(screen.getByText('Completed today +'));
  expect(screen.getByText('Read TypeScript')).toBeTruthy();
  jest.mocked(activityService.getAll).mockResolvedValue({ activities: [], pagination: { page: 1, totalPages: 0, total: 0 } });
  await fireEvent.press(screen.getByText('Undo completion'));
  await waitFor(() => expect(activityService.undo).toHaveBeenCalledWith('activity-1'));
  await waitFor(() => expect(screen.queryByText('Read TypeScript')).toBeNull());
});
test('discard is explicit and removes the draft without creating a task', async () => {
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByText('Create activity'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Discard me');
  await fireEvent.press(screen.getByText('Discard draft'));
  await waitFor(() => expect(screen.queryByDisplayValue('Discard me')).toBeNull());
  await waitFor(async () => expect(await AsyncStorage.getItem('activityDraft:user-1')).toBeNull());
  expect(plannedActivityService.create).not.toHaveBeenCalled();
});

test('recurring edit exposes pause and preserves the server schedule version', async () => {
  const recurring = { ...plannedActivity, scheduleType: 'DAILY' as const };
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [recurring], todayProgress: { completed: 0, total: 1, percentage: 0 } });
  jest.mocked(plannedActivityService.update).mockResolvedValue({ plannedActivity: { ...recurring, status: 'DISABLED' } });
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByLabelText('Edit: Read TypeScript'));
  await fireEvent.press(screen.getByRole('switch', { name: 'Paused' }));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(plannedActivityService.update).toHaveBeenCalledWith(recurring.id, expect.objectContaining({ status: 'DISABLED', scheduleType: 'DAILY', updatedAt: recurring.updatedAt })));
});
test('a notification waits for the fresh task list when the cached snapshot predates the task', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await AsyncStorage.setItem('userData:user-1:cache:tasks%3Aen', JSON.stringify({ version: 1, savedAt: Date.now(), data: { plannedActivities: [], todayProgress: { completed: 0, total: 0, percentage: 0 } } }));
  jest.mocked(useLocalSearchParams).mockReturnValue({ taskId: plannedActivity.id });
  let finish!: (value: any) => void;
  jest.mocked(plannedActivityService.getAll).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await render(<ActivitiesScreen />);
  await waitFor(() => expect(screen.getByText(/Saved data/)).toBeTruthy());
  expect(alert).not.toHaveBeenCalled();
  expect(useRouter().setParams).not.toHaveBeenCalled();
  await act(async () => finish({ plannedActivities: [plannedActivity], todayProgress: { completed: 0, total: 0, percentage: 0 } }));
  await waitFor(() => expect(screen.getByDisplayValue('Read TypeScript')).toBeTruthy());
  alert.mockRestore();
});
test.each(['light', 'dark'] as const)('Today and its form render long Ukrainian titles in %s theme', async themeMode => {
  useSettingsStore.setState({ language: 'uk', themeMode });
  const title = 'Прочитати розділ підручника й підготувати докладний конспект для наступного заняття';
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [{ ...plannedActivity, title, displayTitle: title }], todayProgress: { completed: 0, total: 0, percentage: 0 } });
  await render(<HomeScreen />);
  const text = screen.getByText(title);
  expect(text.props.numberOfLines).toBeUndefined();
  expect(text.props.allowFontScaling).not.toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Швидко додати' }));
  expect(screen.getByText('Додаткові параметри')).toBeTruthy();
  expect(screen.getByText('Зберегти')).toBeTruthy();
});

test('draft calendar date and minutes survive restore without an ISO timezone conversion', async () => {
  await AsyncStorage.setItem('activityDraft:user-1', JSON.stringify({ title: 'Tomorrow', description: '', scheduleType: 'DATE', dueDate: '2026-11-03', dueTimeMinutes: 615 }));
  jest.mocked(plannedActivityService.create).mockResolvedValue({ plannedActivity });
  await render(<ActivitiesScreen />);
  await fireEvent.press(screen.getByText('Create activity'));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(plannedActivityService.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tomorrow', dueDate: '2026-11-03', dueTimeMinutes: 615 })));
});

test('completing a cached habit updates its occurrence even when the follow-up refresh is offline', async () => {
  const current = new Date();
  const day = current.toISOString().slice(0, 10);
  const previousDay = new Date(current.getTime() - 86400000).toISOString().slice(0, 10);
  const habit = { ...plannedActivity, scheduleType: 'DAILY' as const, isCompletedToday: true, occurrenceDate: previousDay, completedTodayAt: `${previousDay}T10:00:00Z` };
  jest.mocked(plannedActivityService.getAll).mockResolvedValueOnce({ plannedActivities: [habit], todayProgress: { completed: 0, total: 1, percentage: 0 } }).mockRejectedValue(new Error('Offline'));
  jest.mocked(plannedActivityService.complete).mockResolvedValue({ ...completionResult, activity: { ...completionResult.activity, completedAt: current.toISOString(), completedForDate: day } });
  await render(<HomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Complete: Read TypeScript' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Complete: Read TypeScript' })).toBeNull());
  await waitFor(async () => {
    const raw = await AsyncStorage.getItem('userData:user-1:cache:tasks%3Aen');
    expect(JSON.parse(raw!).data.plannedActivities[0].occurrenceDate).toBe(day);
  });
});
