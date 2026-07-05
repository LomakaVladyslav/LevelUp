import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { authService } from '../services/auth.service';
import { notificationService } from '../services/notification.service';
import { plannedActivityService } from '../services/plannedActivity.service';

jest.mock('../services/auth.service', () => ({
  authService: {
    getMe: jest.fn(),
  },
}));

jest.mock('../services/plannedActivity.service', () => ({
  plannedActivityService: {
    getAll: jest.fn(async () => ({ plannedActivities: [] })),
  },
}));

jest.mock('../services/notification.service', () => ({
  notificationService: {
    cancelDailyReminder: jest.fn(async () => undefined),
    requestPermission: jest.fn(async () => true),
    rescheduleExistingActivityReminders: jest.fn(async () => undefined),
    scheduleDailyReminder: jest.fn(async () => undefined),
  },
}));

const user = {
  id: 'user-1',
  email: 'user@example.com',
  username: 'tester',
  xp: 0,
  level: 1,
};

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, isLoading: true });
  useSettingsStore.setState({
    language: 'en',
    themeMode: 'light',
    settingsLoaded: false,
    notificationsEnabled: false,
  });
});

test('auth store persists login state and clears it on logout', async () => {
  await useAuthStore.getState().setAuth('token-1', user);

  expect(await AsyncStorage.getItem('token')).toBe('token-1');
  expect(useAuthStore.getState().user?.username).toBe('tester');

  await useAuthStore.getState().logout();

  expect(await AsyncStorage.getItem('token')).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});

test('auth store refreshes the current user from the API', async () => {
  jest.mocked(authService.getMe).mockResolvedValue({ ...user, xp: 120 });

  await useAuthStore.getState().refreshUser();

  expect(useAuthStore.getState().user?.xp).toBe(120);
  expect(await AsyncStorage.getItem('user')).toContain('"xp":120');
});

test('settings store loads saved values and reschedules reminders after language change', async () => {
  await AsyncStorage.multiSet([
    ['language', 'uk'],
    ['themeMode', 'dark'],
    ['notificationsEnabled', 'true'],
  ]);

  await useSettingsStore.getState().loadFromStorage();
  await useSettingsStore.getState().setLanguage('de');

  expect(useSettingsStore.getState().language).toBe('de');
  expect(plannedActivityService.getAll).toHaveBeenCalled();
  expect(notificationService.rescheduleExistingActivityReminders).toHaveBeenCalledWith(
    [],
    'de',
  );
  expect(notificationService.scheduleDailyReminder).toHaveBeenCalledWith('de');
});
