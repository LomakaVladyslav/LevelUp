import { userData } from '../services/user-data';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationService, taskFromNotification } from '../services/notification.service';
import { activityReminderDates, zonedReminderDate } from '../services/reminder-time';
import { apiContext } from '../services/api-context';
import { PlannedActivity } from '../types';

const task = (updates: Partial<PlannedActivity> = {}): PlannedActivity => ({
  id: 'task-1', userId: 'user-1', title: 'Read', displayTitle: 'Read', displayDescription: null, description: null, type: 'STUDY',
  scheduleType: 'DAILY', dueDate: null, dueTimeMinutes: 9 * 60, timezone: 'Europe/Kyiv',
  status: 'ACTIVE', completedAt: null, disabledAt: null, createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), isCompletedToday: false, completedTodayAt: null, streakDays: 0,
  ...updates,
});
let scheduled: Map<string, Notifications.NotificationRequest>;
beforeEach(() => {
  scheduled = new Map();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as any);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => [...scheduled.values()]);
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async (input) => {
    scheduled.set(input.identifier!, input as Notifications.NotificationRequest);
    return input.identifier!;
  });
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async (id) => { scheduled.delete(id); });
  jest.mocked(Notifications.cancelAllScheduledNotificationsAsync).mockImplementation(async () => { scheduled.clear(); });
});

test('fixed-date reminders use the task timezone and follow DST offsets', () => {
  expect(zonedReminderDate('2026-01-15', 9 * 60, 'Europe/Kyiv')?.toISOString()).toBe('2026-01-15T07:00:00.000Z');
  expect(zonedReminderDate('2026-07-15', 9 * 60, 'Europe/Kyiv')?.toISOString()).toBe('2026-07-15T06:00:00.000Z');
  expect(zonedReminderDate('2026-03-08', 2 * 60 + 30, 'America/New_York')).toBeNull();
  expect(zonedReminderDate('2026-11-01', 1 * 60 + 30, 'America/New_York')?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
});

test('a delivered SIMPLE reminder is not recreated on every app launch', () => {
  expect(activityReminderDates(task({ scheduleType: 'SIMPLE', updatedAt: '2026-07-01T07:00:00Z' }), new Date('2026-07-03T00:00:00Z'))).toEqual([]);
});

test('reconciliation restores daily reminders once, and cancels removed tasks', async () => {
  await notificationService.reconcileReminders([task()], 'uk', true);
  const count = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.length;
  expect(count).toBeGreaterThan(1);
  await notificationService.reconcileReminders([task()], 'uk', true);
  // Same server timestamps produce identical requests across launches.
  await notificationService.reconcileReminders([], 'uk', false);
  expect(scheduled.size).toBe(0);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('unchanged tasks do not reschedule and paused tasks never notify', async () => {
  const activity = task();
  await notificationService.reconcileReminders([activity], 'en', true);
  const count = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.length;
  await notificationService.reconcileReminders([activity], 'en', true);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(count);
  await notificationService.reconcileReminders([{ ...activity, status: 'DISABLED' }], 'en', true);
  expect(scheduled.size).toBe(0);
});

test('pending notifications stay bounded even with many daily tasks', async () => {
  const platform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await notificationService.reconcileReminders(Array.from({ length: 80 }, (_, i) => task({ id: `task-${i}` })), 'en', true);
    expect(scheduled.size).toBe(256);
  } finally { Object.defineProperty(Platform, 'OS', { value: platform, configurable: true }); }
});

test('foreground reconciliation never requests denied permissions', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as any);
  await notificationService.reconcileReminders([task()], 'en', true);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(scheduled.size).toBe(0);
});

test('logout wins over queued old-session scheduling', async () => {
  apiContext.setToken('old', 'user-1');
  const schedule = notificationService.scheduleActivityReminder(task(), 'en');
  apiContext.setToken(null);
  const cancel = notificationService.cancelAllReminders();
  await Promise.all([schedule, cancel]);
  expect(scheduled.size).toBe(0);
});

test('completed today removes only today, undo restores the same future occurrence', () => {
  const now = new Date('2026-10-21T05:00:00Z');
  const original = task({ occurrenceDate: '2026-10-21' });
  const complete = { ...original, isCompletedToday: true, completedTodayAt: '2026-10-21T04:00:00Z' };
  expect(activityReminderDates(original, now)[0].toISOString()).toBe('2026-10-21T06:00:00.000Z');
  expect(activityReminderDates(complete, now)[0].toISOString()).toBe('2026-10-22T06:00:00.000Z');
  expect(activityReminderDates({ ...complete, isCompletedToday: false, completedTodayAt: null }, now)[0]).toEqual(activityReminderDates(original, now)[0]);
  expect(activityReminderDates(complete, new Date('2026-10-22T05:00:00Z'))[0].toISOString()).toBe('2026-10-22T06:00:00.000Z');
});
test('selected weekdays and weekdays preset generate only the expected dates', () => {
  const now = new Date('2026-10-19T05:00:00Z');
  const dates = activityReminderDates(task({ scheduleType: 'WEEKLY', weekdays: [1, 3, 5] }), now);
  expect(dates.slice(0, 4).map(d => d.toISOString().slice(0, 10))).toEqual(['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26']);
  const weekdays = activityReminderDates(task({ scheduleType: 'WEEKLY', weekdays: [1, 2, 3, 4, 5] }), now);
  expect(weekdays.some(d => [0, 6].includes(d.getUTCDay()))).toBe(false);
});
test('future schedule revisions preserve today and change tomorrow reminders', () => {
  const activity = task({ scheduleType: 'WEEKLY', weekdays: [4], dueTimeMinutes: 600, scheduleHistory: [
    { from: '2026-10-01', scheduleType: 'DAILY', weekdays: [], paused: false, dueDate: null, dueTimeMinutes: 540, timezone: 'Europe/Kyiv' },
    { from: '2026-10-22', scheduleType: 'WEEKLY', weekdays: [4], paused: false, dueDate: null, dueTimeMinutes: 600, timezone: 'Europe/Kyiv' },
  ] });
  const dates = activityReminderDates(activity, new Date('2026-10-21T05:00:00Z'));
  expect(dates.slice(0, 3).map(d => d.toISOString())).toEqual(['2026-10-21T06:00:00.000Z', '2026-10-22T07:00:00.000Z', '2026-10-29T08:00:00.000Z']);
});
test('toggle off and revoked permission both cancel existing task reminders', async () => {
  await notificationService.reconcileReminders([task()], 'en', true);
  expect(scheduled.size).toBeGreaterThan(0);
  await notificationService.reconcileReminders([task()], 'en', false);
  expect(scheduled.size).toBe(0);
  await notificationService.rescheduleActivityReminder(task(), 'en');
  expect(scheduled.size).toBe(0);
  await notificationService.reconcileReminders([task()], 'en', true);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as any);
  await notificationService.reconcileReminders([task()], 'en', true);
  expect(scheduled.size).toBe(0);
});
test('iOS uses bounded one-off occurrences that can be cancelled individually', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  try {
    await notificationService.reconcileReminders(Array.from({ length: 10 }, (_, i) => task({ id: `habit-${i}` })), 'en', true);
    expect(scheduled.size).toBe(60);
    expect([...scheduled.values()].every(n => (n.trigger as any).type === 'date')).toBe(true);
  } finally { Object.defineProperty(Platform, 'OS', { value: previous, configurable: true }); }
});
test('Android ten daily tasks have over three weeks of coverage and renew after relaunch', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  jest.useFakeTimers().setSystemTime(new Date('2026-10-19T05:00:00Z'));
  try {
    const tasks = Array.from({ length: 10 }, (_, i) => task({ id: `habit-${i}` }));
    await notificationService.reconcileReminders(tasks, 'en', true);
    const times = [...scheduled.values()].map(n => Number(n.content.data.nextAt));
    expect(Math.max(...times) - Date.now()).toBeGreaterThan(24 * 86400000);
    jest.setSystemTime(new Date('2026-10-29T05:00:00Z'));
    await notificationService.reconcileReminders(tasks, 'en', true);
    expect([...scheduled.values()].every(n => Number(n.content.data.nextAt) > Date.now())).toBe(true);
    expect(scheduled.size).toBe(256);
  } finally { jest.useRealTimers(); Object.defineProperty(Platform, 'OS', { value: previous, configurable: true }); }
});
test('notification payload routes a task only within its owning session', () => {
  expect(taskFromNotification({ activityId: 'task-1', userId: 'owner' }, 'owner')).toBe('task-1');
  expect(taskFromNotification({ activityId: 'task-1', userId: 'other' }, 'owner')).toBeNull();
  expect(taskFromNotification({ activityId: '../../auth', userId: 'owner' }, 'owner')).toBeNull();
  expect(taskFromNotification({ activityId: 'task-1', userId: 'owner' })).toBeNull();
});
test('changing a reminder time cancels the obsolete scheduled identifiers', async () => {
  const activity = task();
  await notificationService.reconcileReminders([activity], 'en', true);
  const before = new Set(scheduled.keys());
  await notificationService.reconcileReminders([{ ...activity, dueTimeMinutes: 600 }], 'en', true);
  expect([...scheduled.keys()].some(id => before.has(id))).toBe(false);
});


test('disabled Android reminder channel is reported as denied and cancels pending reminders', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await notificationService.reconcileReminders([task()], 'en', true);
    jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValueOnce({ importance: Notifications.AndroidImportance.NONE } as any);
    expect(await notificationService.getPermissionStatus()).toBe('denied');
    jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValueOnce({ importance: Notifications.AndroidImportance.NONE } as any);
    await notificationService.reconcileReminders([task()], 'en', true);
    expect(scheduled.size).toBe(0);
  } finally { Object.defineProperty(Platform, 'OS', { value: previous, configurable: true }); }
});

test('per-task reminder preference cancels only that task and survives reconciliation', async () => {
  const muted = task(); const other = task({ id: 'other' });
  await notificationService.reconcileReminders([muted, other], 'en', true);
  await userData.setReminder(muted.userId, muted.id, false);
  await notificationService.reconcileReminders([muted, other], 'en', true);
  expect([...scheduled.values()].every(item => item.content.data?.activityId === 'other')).toBe(true);
  expect(scheduled.size).toBeGreaterThan(0);
  await notificationService.rescheduleActivityReminder(muted, 'en');
  expect([...scheduled.values()].some(item => item.content.data?.activityId === muted.id)).toBe(false);
  await userData.setReminder(muted.userId, muted.id, true);
  await notificationService.reconcileReminders([muted, other], 'en', true);
  expect([...scheduled.values()].some(item => item.content.data?.activityId === muted.id)).toBe(true);
});
