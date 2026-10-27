import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationService } from '../services/notification.service';
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
  await notificationService.reconcileReminders([activity], 'en', false);
  const count = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.length;
  await notificationService.reconcileReminders([activity], 'en', false);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(count);
  await notificationService.reconcileReminders([{ ...activity, status: 'DISABLED' }], 'en', false);
  expect(scheduled.size).toBe(0);
});

test('pending notifications stay bounded even with many daily tasks', async () => {
  const platform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await notificationService.reconcileReminders(Array.from({ length: 80 }, (_, i) => task({ id: `task-${i}` })), 'en', true);
    expect(scheduled.size).toBe(61);
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
