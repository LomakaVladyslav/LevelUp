import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { apiContext } from './api-context';
import { activityReminderDates, dateKeyInZone } from './reminder-time';
import { Language, translate } from '../constants/i18n';
import { PlannedActivity } from '../types';

const DAILY_ID = 'levelup-daily';
const ACTIVITY_PREFIX = 'levelup-activity-';
const LEGACY_DAILY_KEY = 'dailyReminderNotificationId';
const LEGACY_ACTIVITY_PREFIX = 'plannedActivityReminder:';
// Leave room for OS/platform bookkeeping on iOS. Android gets a larger rolling window.
export const reminderCapacity = () => Platform.OS === 'ios' ? 60 : 256;
let remindersEnabled = false;
let notificationGeneration = 0;
type Reminder = Notifications.NotificationRequestInput & { identifier: string; nextAt: number };

const buildReminders = (activity: PlannedActivity, language: Language): Reminder[] => {
  const dates = activityReminderDates(activity);
  if (!dates.length) return [];
  return dates.map((date) => ({
    identifier: `${ACTIVITY_PREFIX}${activity.id}:${date.getTime()}`,
    nextAt: date.getTime(),
    content: {
      title: translate(language, 'notifications.activityTitle'),
      body: activity.displayTitle || activity.title,
      data: {
        activityId: activity.id, userId: activity.userId, occurrenceDate: dateKeyInZone(date, activity.timezone), nextAt: date.getTime(),
        stamp: JSON.stringify([language, activity.displayTitle || activity.title, activity.scheduleType, activity.dueDate, activity.dueTimeMinutes, activity.timezone, activity.updatedAt]),
      },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminders' },
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
  const selected = desired.sort((a, b) => a.nextAt - b.nextAt || a.identifier.localeCompare(b.identifier)).slice(0, reminderCapacity());
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
async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || permission.status === 'granted' ||
    (permission.ios !== undefined && permission.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
  if (!granted) return permission.status === 'denied' ? 'denied' : 'undetermined';
  if (Platform.OS === 'android') {
    const channel = await Notifications.getNotificationChannelAsync('reminders');
    if (channel?.importance === Notifications.AndroidImportance.NONE) return 'denied';
  }
  return 'granted';
}
const requestPermission = () => {
  if (!permissionRequest) permissionRequest = (async () => {
    await ensureChannel();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.status === 'granted') return await getPermissionStatus() === 'granted';
    await Notifications.requestPermissionsAsync();
    return await getPermissionStatus() === 'granted';
  })().finally(() => { permissionRequest = null; });
  return permissionRequest;
};
async function scheduleActivityReminder(activity: PlannedActivity, language: Language) {
  if (!remindersEnabled) return cancelActivityReminder(activity.id);
  const reminders = buildReminders(activity, language);
  if (!reminders.length) return cancelActivityReminder(activity.id);
  if (await getPermissionStatus() !== 'granted') return cancelActivityReminder(activity.id);
  await clearLegacyIds(activity.id);
  const previous = await Notifications.getAllScheduledNotificationsAsync();
  // Retain other tasks, applying one shared capacity limit across the whole app.
  const other = previous.filter((item) => item.identifier.startsWith(ACTIVITY_PREFIX) && item.content.data?.activityId !== activity.id)
    .map((item) => ({ ...item, nextAt: Number(item.content.data?.nextAt) || Date.now() } as Reminder));
  await applyReminders([...other, ...reminders], previous);
}
async function reconcileReminders(activities: PlannedActivity[], language: Language, enabled: boolean) {
  remindersEnabled = enabled;
  await ensureChannel();
  await cancelDailyReminder();
  await clearLegacyIds();
  const permissionStatus = await getPermissionStatus();
  const previous = await Notifications.getAllScheduledNotificationsAsync();
  const permitted = permissionStatus === 'granted';
  await applyReminders(enabled && permitted ? activities.flatMap((activity) => buildReminders(activity, language)) : [], previous);
}

// Treat notification data as untrusted; never route across an account boundary.
export function taskFromNotification(data: Record<string, unknown>, userId?: string): string | null {
  return userId && data.userId === userId && typeof data.activityId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(data.activityId) ? data.activityId : null;
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
  const generation = notificationGeneration;
  return queued(async () => {
    if (session !== apiContext.get().sessionVersion || generation !== notificationGeneration) return;
    return work();
  });
};
export const notificationService = {
  configure: () => Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) }),
  requestPermission,
  getPermissionStatus,
  scheduleActivityReminder: (activity: PlannedActivity, language: Language) => sessionWork(() => scheduleActivityReminder(activity, language)),
  rescheduleActivityReminder: (activity: PlannedActivity, language: Language) => sessionWork(() => scheduleActivityReminder(activity, language)),
  cancelActivityReminder: (id: string) => queued(() => cancelActivityReminder(id)),
  rescheduleExistingActivityReminders: (activities: PlannedActivity[], language: Language) => sessionWork(async () => {
    await reconcileReminders(activities, language, remindersEnabled);
  }),
  reconcileReminders: (activities: PlannedActivity[], language: Language, enabled: boolean) => sessionWork(() => reconcileReminders(activities, language, enabled)),
  cancelAllReminders: () => { notificationGeneration++; remindersEnabled = false; return queued(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key === LEGACY_DAILY_KEY || key.startsWith(LEGACY_ACTIVITY_PREFIX)));
  }); },
};
