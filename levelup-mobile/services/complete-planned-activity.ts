import type { PlannedActivity } from '../types';
import { useAuthStore } from '../stores/auth.store';
import { apiContext } from './api-context';
import { plannedActivityService } from './plannedActivity.service';
import { notificationService } from './notification.service';
import { dateKeyInZone } from './reminder-time';

export async function completePlannedActivity(activity: PlannedActivity) {
  const session = apiContext.get().sessionVersion;
  const result = await (activity.scheduleType === 'DAILY'
    ? plannedActivityService.complete(activity.id, dateKeyInZone(new Date(), activity.timezone))
    : plannedActivityService.complete(activity.id));
  if (session !== apiContext.get().sessionVersion) return result;
  const auth = useAuthStore.getState();
  // A replayed receipt can be older than other completions already shown locally.
  if (result.totalXp !== undefined) auth.updateUser({
    xp: Math.max(result.totalXp, auth.user?.xp ?? 0),
    level: Math.max(result.newLevel, auth.user?.level ?? 1),
  });
  else void auth.refreshUser().catch(() => undefined);
  if (activity.scheduleType !== 'DAILY') {
    void notificationService.cancelActivityReminder(activity.id).catch(() => undefined);
  }
  return result;
}
