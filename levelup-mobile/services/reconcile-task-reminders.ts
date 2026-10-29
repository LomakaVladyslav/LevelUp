import { apiContext } from './api-context';
import { plannedActivityService } from './plannedActivity.service';
import { notificationService } from './notification.service';
import { useSettingsStore } from '../stores/settings.store';
import { useDataRevision } from '../stores/data.store';

// A mutation response omits today's completion metrics. Always read the current
// server schedule before replenishing; cancel obsolete reminders even if offline.
export async function reconcileTaskReminders(changedTaskId?: string) {
  const session = apiContext.get().sessionVersion;
  const revision = useDataRevision.getState().revision;
  if (changedTaskId) await notificationService.cancelActivityReminder(changedTaskId);
  if (session !== apiContext.get().sessionVersion) return;
  const { plannedActivities } = await plannedActivityService.getAll();
  if (session !== apiContext.get().sessionVersion || revision !== useDataRevision.getState().revision) return;
  const settings = useSettingsStore.getState();
  await notificationService.reconcileReminders(plannedActivities, settings.language, settings.notificationsEnabled);
}
