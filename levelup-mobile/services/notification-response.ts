import * as Notifications from 'expo-notifications';
import { apiContext } from './api-context';
import { taskFromNotification } from './notification.service';

export function observeTaskNotifications(userId: string, navigate: (taskId: string) => void, navigation?: {
  isReady: () => boolean; subscribe: (flush: () => void) => () => void;
}) {
  let active = true;
  let pending: Notifications.NotificationResponse | null = null;
  const seen = new Set<string>();
  const session = apiContext.get().sessionVersion;
  const flush = () => {
    if (!active || session !== apiContext.get().sessionVersion || !pending || (navigation && !navigation.isReady())) return;
    const response = pending;
    pending = null;
    const request = response.notification.request;
    if (seen.has(request.identifier)) return;
    seen.add(request.identifier);
    const id = taskFromNotification(request.content.data, userId);
    if (id) navigate(id);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  };
  const open = (response: Notifications.NotificationResponse | null) => {
    if (!active || session !== apiContext.get().sessionVersion || !response) return;
    pending = response;
    flush();
  };
  const stopNavigation = navigation?.subscribe(flush);
  const listener = Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  return () => { active = false; pending = null; listener.remove(); stopNavigation?.(); };
}
