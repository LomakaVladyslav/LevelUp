import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Language, translate } from '../constants/i18n';
import { PlannedActivity } from '../types';

const REMINDER_ID_KEY = 'dailyReminderNotificationId';
const activityReminderKey = (activityId: string) => `plannedActivityReminder:${activityId}`;

const minutesToHourMinute = (minutes: number) => ({
  hour: Math.floor(minutes / 60),
  minute: minutes % 60,
});

const parseStoredDate = (value?: string | null) => {
  if (!value) return null;

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
};

const nextSimpleReminderDate = (dueTimeMinutes: number) => {
  const { hour, minute } = minutesToHourMinute(dueTimeMinutes);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }

  return date;
};

const buildActivityTrigger = (
  activity: PlannedActivity,
): Notifications.NotificationTriggerInput | null => {
  if (activity.status !== 'ACTIVE' || activity.dueTimeMinutes == null) {
    return null;
  }

  const { hour, minute } = minutesToHourMinute(activity.dueTimeMinutes);

  if (activity.scheduleType === 'DAILY') {
    return { hour, minute, repeats: true } as Notifications.NotificationTriggerInput;
  }

  if (activity.scheduleType === 'DATE') {
    const date = parseStoredDate(activity.dueDate);
    if (!date) return null;

    date.setHours(hour, minute, 0, 0);
    return date.getTime() > Date.now() ? date : null;
  }

  return nextSimpleReminderDate(activity.dueTimeMinutes);
};

export const notificationService = {
  configure: () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  },

  requestPermission: async () => {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  },

  scheduleDailyReminder: async (language: Language) => {
    await notificationService.cancelDailyReminder();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: translate(language, 'notifications.title'),
        body: translate(language, 'notifications.body'),
      },
      trigger: {
        hour: 9,
        minute: 0,
        repeats: true,
      } as Notifications.NotificationTriggerInput,
    });

    await AsyncStorage.setItem(REMINDER_ID_KEY, id);
    return id;
  },

  cancelDailyReminder: async () => {
    const id = await AsyncStorage.getItem(REMINDER_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(REMINDER_ID_KEY);
    }
  },

  scheduleActivityReminder: async (
    activity: PlannedActivity,
    language: Language,
  ) => {
    await notificationService.cancelActivityReminder(activity.id);

    const trigger = buildActivityTrigger(activity);
    if (!trigger) return null;

    const granted = await notificationService.requestPermission();
    if (!granted) {
      throw new Error('notifications.permissionDenied');
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: translate(language, 'notifications.activityTitle'),
        body: activity.displayTitle || activity.title,
      },
      trigger,
    });

    await AsyncStorage.setItem(activityReminderKey(activity.id), id);
    return id;
  },

  cancelActivityReminder: async (activityId: string) => {
    const key = activityReminderKey(activityId);
    const id = await AsyncStorage.getItem(key);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(key);
    }
  },

  rescheduleActivityReminder: async (
    activity: PlannedActivity,
    language: Language,
  ) => {
    await notificationService.cancelActivityReminder(activity.id);
    return notificationService.scheduleActivityReminder(activity, language);
  },

  rescheduleExistingActivityReminders: async (
    activities: PlannedActivity[],
    language: Language,
  ) => {
    const existingActivities: PlannedActivity[] = [];

    for (const activity of activities) {
      const reminderId = await AsyncStorage.getItem(activityReminderKey(activity.id));
      if (reminderId) existingActivities.push(activity);
    }

    const results = await Promise.allSettled(
      existingActivities.map((activity) =>
        notificationService.rescheduleActivityReminder(activity, language),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Failed to reschedule activity reminder:', result.reason);
      }
    }
  },
};
