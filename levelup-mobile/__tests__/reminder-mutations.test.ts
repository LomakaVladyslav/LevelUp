import { reconcileTaskReminders } from '../services/reconcile-task-reminders';
import { notificationService } from '../services/notification.service';
import { plannedActivityService } from '../services/plannedActivity.service';
import { apiContext } from '../services/api-context';
import { useSettingsStore } from '../stores/settings.store';
import { invalidateData } from '../stores/data.store';
jest.mock('../services/notification.service', () => ({ notificationService: { cancelActivityReminder: jest.fn(async () => undefined), reconcileReminders: jest.fn() } }));
jest.mock('../services/plannedActivity.service', () => ({ plannedActivityService: { getAll: jest.fn() } }));
beforeEach(() => { apiContext.setToken('token', 'owner'); useSettingsStore.setState({ notificationsEnabled: true, language: 'en' }); });
test('edit reconciliation uses fresh completion metrics and cancels obsolete requests first', async () => {
  const task = { id: 'task', isCompletedToday: true };
  jest.mocked(plannedActivityService.getAll).mockResolvedValue({ plannedActivities: [task] } as any);
  await reconcileTaskReminders('task');
  expect(notificationService.cancelActivityReminder).toHaveBeenCalledWith('task');
  expect(notificationService.reconcileReminders).toHaveBeenCalledWith([task], 'en', true);
  expect(jest.mocked(notificationService.cancelActivityReminder).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(plannedActivityService.getAll).mock.invocationCallOrder[0]);
});
test('failed fetch after an edit cannot keep the obsolete reminder active', async () => {
  jest.mocked(plannedActivityService.getAll).mockRejectedValueOnce(new Error('offline'));
  await expect(reconcileTaskReminders('task')).rejects.toThrow('offline');
  expect(notificationService.cancelActivityReminder).toHaveBeenCalledWith('task');
  expect(notificationService.reconcileReminders).not.toHaveBeenCalled();
});
test('account switch while cancellation is pending cannot reschedule an old account task', async () => {
  let release!: () => void;
  jest.mocked(notificationService.cancelActivityReminder).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  const pending = reconcileTaskReminders('task');
  apiContext.setToken('other', 'other'); release(); await pending;
  expect(plannedActivityService.getAll).not.toHaveBeenCalled();
});
test('newer task mutation invalidates an older schedule read', async () => {
  let release!: (data: any) => void;
  jest.mocked(plannedActivityService.getAll).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  const pending = reconcileTaskReminders();
  invalidateData(); release({ plannedActivities: [] }); await pending;
  expect(notificationService.reconcileReminders).not.toHaveBeenCalled();
});
