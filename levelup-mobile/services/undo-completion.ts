import { activityService } from './activity.service';
import { apiContext } from './api-context';
import { useAuthStore } from '../stores/auth.store';
import { reconcileTaskReminders } from './reconcile-task-reminders';

export async function undoCompletion(activityId: string) {
  const session = apiContext.get().sessionVersion;
  const result = await activityService.undo(activityId);
  if (session !== apiContext.get().sessionVersion) return;
  // Fetch current authoritative totals: an idempotency receipt can be older than
  // subsequent writes. In particular Math.max would make XP rollback impossible.
  await useAuthStore.getState().refreshUser().catch(() => undefined);
  if (session !== apiContext.get().sessionVersion) return;
  try {
    await reconcileTaskReminders();
  } catch { /* Root foreground/revision reconciliation retries independent notification work. */ }
  return result;
}
