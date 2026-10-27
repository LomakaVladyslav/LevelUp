import { apiContext } from '../services/api-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { isLanguage, Language } from '../constants/i18n';
import { isThemeMode, ThemeMode } from '../constants/theme';
import { notificationService } from '../services/notification.service';
import { plannedActivityService } from '../services/plannedActivity.service';

interface SettingsStore {
  language: Language;
  themeMode: ThemeMode;
  settingsLoaded: boolean;
  notificationsEnabled: boolean;
  loadFromStorage: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  setThemeMode: (themeMode: ThemeMode) => Promise<void>;
  resetNotifications: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

const LANGUAGE_KEY = 'language';
const THEME_MODE_KEY = 'themeMode';
const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

let notificationRevision = 0;
let notificationWrites: Promise<unknown> = Promise.resolve();
const persistNotification = (action: () => Promise<void>) => {
  const next = notificationWrites.then(action, action);
  notificationWrites = next.catch(() => undefined);
  return next;
};

export const useSettingsStore = createSettingsStore();

function createSettingsStore() {
  return create<SettingsStore>((set, get) => ({
    language: 'en',
    themeMode: 'light',
    settingsLoaded: false,
    notificationsEnabled: false,

    loadFromStorage: async () => {
      const revision = notificationRevision;
      try {
        const [storedLanguage, storedThemeMode, storedNotificationsEnabled] = await Promise.all([
          AsyncStorage.getItem(LANGUAGE_KEY),
          AsyncStorage.getItem(THEME_MODE_KEY),
          AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
        ]);

        apiContext.setLanguage(isLanguage(storedLanguage) ? storedLanguage : 'en');
        set({
          language: isLanguage(storedLanguage) ? storedLanguage : 'en',
          themeMode: isThemeMode(storedThemeMode) ? storedThemeMode : 'light',
          ...(revision === notificationRevision ? { notificationsEnabled: storedNotificationsEnabled === 'true' } : {}),
          settingsLoaded: true,
        });
      } catch (error) {
        console.error('Failed to load settings:', error);
        set({ settingsLoaded: true });
      }
    },

    setLanguage: async (language) => {
      await AsyncStorage.setItem(LANGUAGE_KEY, language);
      apiContext.setLanguage(language);
      set({ language });
      if (!apiContext.get().token) return;

      const session = apiContext.get().sessionVersion;
      const reminderUpdates: Promise<unknown>[] = [
        plannedActivityService.getAll().then(({ plannedActivities }) => {
          if (session !== apiContext.get().sessionVersion || get().language !== language) return;
          return notificationService.rescheduleExistingActivityReminders(
            plannedActivities,
            language,
          );
        }),
      ];

      if (get().notificationsEnabled) {
        reminderUpdates.push(
          notificationService.scheduleDailyReminder(language),
        );
      }

      const results = await Promise.allSettled(reminderUpdates);
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('Failed to update reminders after language change:', result.reason);
        }
      }
    },

    setThemeMode: async (themeMode) => {
      await AsyncStorage.setItem(THEME_MODE_KEY, themeMode);
      set({ themeMode });
    },

    resetNotifications: async () => {
      ++notificationRevision;
      set({ notificationsEnabled: false });
      await persistNotification(() => AsyncStorage.removeItem(NOTIFICATIONS_ENABLED_KEY));
    },
    setNotificationsEnabled: async (enabled) => {
      const revision = ++notificationRevision;
      const session = apiContext.get().sessionVersion;
      const isCurrent = () => revision === notificationRevision && session === apiContext.get().sessionVersion;
      if (enabled) {
        const granted = await notificationService.requestPermission();
        if (!isCurrent()) return;
        if (!granted) throw new Error('notifications.permissionDenied');
        await notificationService.scheduleDailyReminder(get().language);
      } else {
        await notificationService.cancelDailyReminder();
      }
      await persistNotification(async () => {
        if (!isCurrent()) return;
        await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
        if (isCurrent()) set({ notificationsEnabled: enabled });
      });
    },
  }));
}
