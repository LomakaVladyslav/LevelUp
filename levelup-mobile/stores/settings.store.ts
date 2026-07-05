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
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

const LANGUAGE_KEY = 'language';
const THEME_MODE_KEY = 'themeMode';
const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

export const useSettingsStore = createSettingsStore();

function createSettingsStore() {
  return create<SettingsStore>((set, get) => ({
    language: 'en',
    themeMode: 'light',
    settingsLoaded: false,
    notificationsEnabled: false,

    loadFromStorage: async () => {
      try {
        const [storedLanguage, storedThemeMode, storedNotificationsEnabled] = await Promise.all([
          AsyncStorage.getItem(LANGUAGE_KEY),
          AsyncStorage.getItem(THEME_MODE_KEY),
          AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
        ]);

        set({
          language: isLanguage(storedLanguage) ? storedLanguage : 'en',
          themeMode: isThemeMode(storedThemeMode) ? storedThemeMode : 'light',
          notificationsEnabled: storedNotificationsEnabled === 'true',
          settingsLoaded: true,
        });
      } catch (error) {
        console.error('Failed to load settings:', error);
        set({ settingsLoaded: true });
      }
    },

    setLanguage: async (language) => {
      set({ language });
      await AsyncStorage.setItem(LANGUAGE_KEY, language);

      const reminderUpdates: Promise<unknown>[] = [
        plannedActivityService.getAll().then(({ plannedActivities }) =>
          notificationService.rescheduleExistingActivityReminders(
            plannedActivities,
            language,
          ),
        ),
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
      set({ themeMode });
      await AsyncStorage.setItem(THEME_MODE_KEY, themeMode);
    },

    setNotificationsEnabled: async (enabled) => {
      if (enabled) {
        const granted = await notificationService.requestPermission();
        if (!granted) {
          throw new Error('notifications.permissionDenied');
        }

        await notificationService.scheduleDailyReminder(get().language);
      } else {
        await notificationService.cancelDailyReminder();
      }

      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
      set({ notificationsEnabled: enabled });
    },
  }));
}
