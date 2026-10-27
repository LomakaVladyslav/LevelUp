import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { apiContext } from './api-context';
import { activityReminderDates } from './reminder-time';
import { Language, translate } from '../constants/i18n';
import { PlannedActivity } from '../types';

const DAILY_ID = 'levelup-daily';
const ACTIVITY_PREFIX = 'levelup-activity-';
const LEGACY_DAILY_KEY = 'dailyReminderNotificationId';
const LEGACY_ACTIVITY_PREFIX = 'plannedActivityReminder:';
// Leave room for the daily prompt and OS/platform bookkeeping (iOS permits 64 pending).
const MAX_ACTIVITY_REMINDERS = 60;
type Reminder = Notifications.NotificationRequestInput & { identifier: string; nextAt: number };

const buildReminders = (activity: PlannedActivity, language: Language): Reminder[] => {
  const dates = activityReminderDates(activity);
  if (!dates.length) return [];
  const recurring = Platform.OS === 'ios' && activity.scheduleType === 'DAILY';
  return (recurring ? dates.slice(0, 1) : dates).map((date) => ({
    identifier: `${ACTIVITY_PREFIX}${activity.id}${recurring ? '' : `:${date.getTime()}`}`,
    nextAt: date.getTime(),
    content: {
      title: translate(language, 'notifications.activityTitle'),
      body: activity.displayTitle || activity.title,
      data: {
        activityId: activity.id, nextAt: date.getTime(),
        stamp: JSON.stringify([language, activity.displayTitle || activity.title, activity.scheduleType, activity.dueDate, activity.dueTimeMinutes, activity.timezone, activity.updatedAt]),
      },
    },
    trigger: recurring ? {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: Math.floor(activity.dueTimeMinutes! / 60), minute: activity.dueTimeMinutes! % 60,
      timezone: activity.timezone, repeats: true,
    } : { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminders' },
  }));
};

async function clearLegacyIds(activityId?: string) {
  const keys = activityId ? [`${LEGACY_ACTIVITY_PREFIX}${activityId}`] :
    (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(LEGACY_ACTIVITY_PREFIX));
  for (const key of keys) {
    const id = await AsyncStorage.getItem(key);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
  }
  await AsyncStorage.multiRemove(keys);
}
async function applyReminders(desired: Reminder[], previous: Notifications.NotificationRequest[]) {
  const selected = desired.sort((a, b) => a.nextAt - b.nextAt || a.identifier.localeCompare(b.identifier)).slice(0, MAX_ACTIVITY_REMINDERS);
  const ids = new Set(selected.map((item) => item.identifier));
  for (const item of previous) {
    if (item.identifier.startsWith(ACTIVITY_PREFIX) && !ids.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
  }
  for (const { nextAt: _nextAt, ...item } of selected) {
    const old = previous.find((candidate) => candidate.identifier === item.identifier);
    if (old?.content.data?.stamp === item.content.data?.stamp) continue;
    await Notifications.scheduleNotificationAsync(item);
  }
}
async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  const legacyId = await AsyncStorage.getItem(LEGACY_DAILY_KEY);
  if (legacyId && legacyId !== DAILY_ID) await Notifications.cancelScheduledNotificationAsync(legacyId);
  await AsyncStorage.removeItem(LEGACY_DAILY_KEY);
}
async function scheduleDailyReminder(language: Language) {
  await cancelDailyReminder();
  return Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: { title: translate(language, 'notifications.title'), body: translate(language, 'notifications.body'), data: { language } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 9, minute: 0, channelId: 'reminders' },
  });
}
async function cancelActivityReminder(activityId: string) {
  const previous = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of previous) {
    if (item.content.data?.activityId === activityId || item.identifier === `${ACTIVITY_PREFIX}${activityId}`) await Notifications.cancelScheduledNotificationAsync(item.identifier);
  }
  await clearLegacyIds(activityId);
}

let permissionRequest: Promise<boolean> | null = null;
async function ensureChannel() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
}
const requestPermission = () => {
  if (!permissionRequest) permissionRequest = (async () => {
    await ensureChannel();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.status === 'granted') return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted || requested.status === 'granted';
  })().finally(() => { permissionRequest = null; });
  return permissionRequest;
};
async function scheduleActivityReminder(activity: PlannedActivity, language: Language) {
  const reminders = buildReminders(activity, language);
  if (!reminders.length) return cancelActivityReminder(activity.id);
  if (!await requestPermission()) throw new Error('notifications.permissionDenied');
  await clearLegacyIds(activity.id);
  const previous = await Notifications.getAllScheduledNotificationsAsync();
  // Retain other tasks, applying one shared capacity limit across the whole app.
  const other = previous.filter((item) => item.identifier.startsWith(ACTIVITY_PREFIX) && item.content.data?.activityId !== activity.id)
    .map((item) => ({ ...item, nextAt: Number(item.content.data?.nextAt) || Date.now() } as Reminder));
  await applyReminders([...other, ...reminders], previous);
}
async function reconcileReminders(activities: PlannedActivity[], language: Language, dailyEnabled: boolean) {
  await ensureChannel();
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && permissions.status !== 'granted') return;
  await clearLegacyIds();
  const previous = await Notifications.getAllScheduledNotificationsAsync();
  await applyReminders(activities.flatMap((activity) => buildReminders(activity, language)), previous);
  const daily = previous.find((item) => item.identifier === DAILY_ID);
  if (!dailyEnabled) await cancelDailyReminder();
  else if (daily?.content.data?.language !== language) await scheduleDailyReminder(language);
}

// Logout cancellation is queued behind in-flight native calls. Later work from its old
// session is discarded, so neither edits nor language changes can resurrect reminders.
let queue: Promise<unknown> = Promise.resolve();
const queued = <T>(work: () => Promise<T>) => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};
const sessionWork = <T>(work: () => Promise<T>) => {
  const session = apiContext.get().sessionVersion;
  return queued(async () => {
    if (session !== apiContext.get().sessionVersion) return;
    return work();
  });
};
export const notificationService = {
  configure: () => Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) }),
  requestPermission,
  scheduleDailyReminder: (language: Language) => sessionWork(() => scheduleDailyReminder(language)),
  cancelDailyReminder: () => queued(cancelDailyReminder),
  scheduleActivityReminder: (activity: PlannedActivity, language: Language) => sessionWork(() => scheduleActivityReminder(activity, language)),
  rescheduleActivityReminder: (activity: PlannedActivity, language: Language) => sessionWork(() => scheduleActivityReminder(activity, language)),
  cancelActivityReminder: (id: string) => queued(() => cancelActivityReminder(id)),
  rescheduleExistingActivityReminders: (activities: PlannedActivity[], language: Language) => sessionWork(async () => {
    const previous = await Notifications.getAllScheduledNotificationsAsync();
    await reconcileReminders(activities, language, previous.some((item) => item.identifier === DAILY_ID));
  }),
  reconcileReminders: (activities: PlannedActivity[], language: Language, dailyEnabled: boolean) => sessionWork(() => reconcileReminders(activities, language, dailyEnabled)),
  cancelAllReminders: () => queued(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key === LEGACY_DAILY_KEY || key.startsWith(LEGACY_ACTIVITY_PREFIX)));
  }),
};
