import * as SecureStore from 'expo-secure-store';
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
    cancelAllReminders: jest.fn(async () => undefined),
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

  expect(JSON.parse((await SecureStore.getItemAsync('levelup.session'))!).token).toBe('token-1');
  expect(await AsyncStorage.getItem('token')).toBeNull();
  expect(useAuthStore.getState().user?.username).toBe('tester');

  await useAuthStore.getState().logout();

  expect(await AsyncStorage.getItem('token')).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});

test('auth store refreshes the current user from the API', async () => {
  jest.mocked(authService.getMe).mockResolvedValue({ ...user, xp: 120 });

  await useAuthStore.getState().setAuth('token-1', user);
  await useAuthStore.getState().refreshUser();

  expect(useAuthStore.getState().user?.xp).toBe(120);
  expect(await SecureStore.getItemAsync('levelup.session')).toContain('"xp":120');
});

test('settings store loads saved values and reschedules reminders after language change', async () => {
  await AsyncStorage.multiSet([
    ['language', 'uk'],
    ['themeMode', 'dark'],
    ['notificationsEnabled', 'true'],
  ]);

  await useAuthStore.getState().setAuth('token-1', user);
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

test('legacy sessions migrate to one secure item and remove the plaintext token', async () => {
  await AsyncStorage.multiSet([['token', 'legacy-token'], ['user', JSON.stringify(user)]]);
  await useAuthStore.getState().loadFromStorage();
  expect(useAuthStore.getState().token).toBe('legacy-token');
  expect(await AsyncStorage.getItem('token')).toBeNull();
  const saved = JSON.parse((await SecureStore.getItemAsync('levelup.session'))!);
  expect(saved).toEqual({ token: 'legacy-token', user });
});

test('a late profile refresh cannot restore a logged-out account', async () => {
  await useAuthStore.getState().setAuth('token-1', user);
  let resolve!: (value: typeof user) => void;
  jest.mocked(authService.getMe).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const refresh = useAuthStore.getState().refreshUser();
  await useAuthStore.getState().logout();
  resolve({ ...user, xp: 999 });
  await refresh;
  expect(useAuthStore.getState().user).toBeNull();
  expect(await SecureStore.getItemAsync('levelup.session')).toBeNull();
});

test('an older profile response cannot overwrite a newer XP update', async () => {
  await useAuthStore.getState().setAuth('token-1', user);
  let resolve!: (value: typeof user) => void;
  jest.mocked(authService.getMe).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const refresh = useAuthStore.getState().refreshUser();
  await useAuthStore.getState().setUser({ ...user, xp: 200 });
  resolve({ ...user, xp: 50 });
  await refresh;
  expect(useAuthStore.getState().user?.xp).toBe(200);
});

test('saving an older profile snapshot preserves XP earned while updating the profile', async () => {
  await useAuthStore.getState().setAuth('token-1', { ...user, xp: 240, level: 3 });
  await useAuthStore.getState().setUser({ ...user, xp: 120, level: 2, age: 25 });
  expect(useAuthStore.getState().user).toMatchObject({ xp: 240, level: 3, age: 25 });
  expect(JSON.parse((await SecureStore.getItemAsync('levelup.session'))!).user).toMatchObject({ xp: 240, level: 3, age: 25 });
});

test('a failed login persistence cannot pair a previous token with a different user', async () => {
  await useAuthStore.getState().setAuth('token-1', user);
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Storage full'));
  await expect(useAuthStore.getState().setAuth('token-2', { ...user, id: 'user-2' })).rejects.toThrow('Storage full');
  await useAuthStore.getState().loadFromStorage();
  expect(useAuthStore.getState().token).toBe('token-1');
  expect(useAuthStore.getState().user?.id).toBe('user-1');
});

test('logout remains durable when secure deletion fails but the logout marker is saved', async () => {
  await useAuthStore.getState().setAuth('token-1', user);
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('Secure storage unavailable'));
  await useAuthStore.getState().logout();
  await useAuthStore.getState().loadFromStorage();
  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});

test('invalid stored JSON does not leave startup loading forever', async () => {
  await SecureStore.setItemAsync('levelup.session', '{invalid');
  await useAuthStore.getState().loadFromStorage();
  expect(useAuthStore.getState().isLoading).toBe(false);
  expect(useAuthStore.getState().user).toBeNull();
});
