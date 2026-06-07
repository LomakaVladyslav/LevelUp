import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Language } from '../constants/i18n';
import { notificationService } from '../services/notification.service';
import { plannedActivityService } from '../services/plannedActivity.service';

interface SettingsStore {
  language: Language;
  notificationsEnabled: boolean;
  loadFromStorage: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  toggleLanguage: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

const LANGUAGE_KEY = 'language';
const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

export const useSettingsStore = createSettingsStore();

function createSettingsStore() {
  return create<SettingsStore>((set, get) => ({
    language: 'en',
    notificationsEnabled: false,

    loadFromStorage: async () => {
      const [storedLanguage, storedNotificationsEnabled] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_KEY),
        AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
      ]);

      set({
        language: storedLanguage === 'uk' ? 'uk' : 'en',
        notificationsEnabled: storedNotificationsEnabled === 'true',
      });
    },

    setLanguage: async (language) => {
      await AsyncStorage.setItem(LANGUAGE_KEY, language);
      set({ language });

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

    toggleLanguage: async () => {
      const nextLanguage: Language = get().language === 'en' ? 'uk' : 'en';
      await get().setLanguage(nextLanguage);
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
