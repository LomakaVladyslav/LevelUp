import type { PlannedActivity } from '../types';
import { useAuthStore } from '../stores/auth.store';
import { apiContext } from './api-context';
import { plannedActivityService } from './plannedActivity.service';
import { reconcileTaskReminders } from './reconcile-task-reminders';
import { dateKeyInZone, isRecurring } from './reminder-time';

export async function completePlannedActivity(activity: PlannedActivity) {
  const session = apiContext.get().sessionVersion;
  const result = await plannedActivityService.complete(activity.id,
    isRecurring(activity.scheduleType) ? activity.occurrenceDate ?? dateKeyInZone(new Date(), activity.timezone) : undefined,
    activity.updatedAt);
  if (session !== apiContext.get().sessionVersion) return result;
  void useAuthStore.getState().refreshUser().catch(() => undefined);
  void reconcileTaskReminders(activity.id).catch(() => undefined);
  return result;
}
