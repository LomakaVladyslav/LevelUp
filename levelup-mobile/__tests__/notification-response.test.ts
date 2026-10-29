import * as Notifications from 'expo-notifications';
import { observeTaskNotifications } from '../services/notification-response';
import { apiContext } from '../services/api-context';
const response = (userId = 'owner') => ({ notification: { request: { identifier: 'reminder-1', content: { data: { userId, activityId: 'task-1' } } } } }) as unknown as Notifications.NotificationResponse;
test('cold-start and foreground taps route to the exact task only once', async () => {
  apiContext.setToken('token', 'owner');
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response());
  const navigate = jest.fn();
  const stop = observeTaskNotifications('owner', navigate);
  await Promise.resolve();
  expect(navigate).toHaveBeenCalledWith('task-1');
  jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls.at(-1)![0](response());
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  stop();
});
test('account switch before cold-start response arrives discards the old navigation', async () => {
  apiContext.setToken('token', 'owner');
  let finish!: (value: Notifications.NotificationResponse) => void;
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const navigate = jest.fn();
  const stop = observeTaskNotifications('owner', navigate);
  apiContext.setToken('other-token', 'other');
  finish(response());
  await Promise.resolve();
  expect(navigate).not.toHaveBeenCalled();
  stop();
});
test('unmount removes the observer and prevents a delayed initial redirect', async () => {
  apiContext.setToken('token', 'owner');
  const navigate = jest.fn();
  const remove = jest.fn();
  jest.mocked(Notifications.addNotificationResponseReceivedListener).mockReturnValueOnce({ remove });
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response());
  const stop = observeTaskNotifications('owner', navigate);
  stop();
  await Promise.resolve();
  expect(navigate).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
});

test('cold-start tap is retained until navigation is ready, then consumed once', async () => {
  apiContext.setToken('token', 'owner');
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response());
  let ready = false;
  let flush!: () => void;
  const unsubscribe = jest.fn();
  const navigate = jest.fn();
  const stop = observeTaskNotifications('owner', navigate, {
    isReady: () => ready, subscribe: (callback) => { flush = callback; return unsubscribe; },
  });
  await Promise.resolve();
  expect(navigate).not.toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  ready = true; flush(); flush();
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('task-1');
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  stop(); expect(unsubscribe).toHaveBeenCalled();
});

test('a tap waiting for navigation is discarded after an account switch', async () => {
  apiContext.setToken('token', 'owner');
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response());
  let ready = false;
  let flush!: () => void;
  const navigate = jest.fn();
  const stop = observeTaskNotifications('owner', navigate, {
    isReady: () => ready, subscribe: (callback) => { flush = callback; return () => undefined; },
  });
  await Promise.resolve();
  apiContext.setToken('other-token', 'other');
  ready = true; flush();
  expect(navigate).not.toHaveBeenCalled();
  stop();
});
