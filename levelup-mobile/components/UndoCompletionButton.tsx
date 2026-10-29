import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ActionButton } from './ScreenUi';
import { undoCompletion } from '../services/undo-completion';
import { apiContext } from '../services/api-context';
import { useT } from '../hooks/useT';
import { getApiErrorMessage } from '../utils/api-error';

export function UndoCompletionButton({ activityId, onDone }: { activityId: string; onDone: () => void }) {
  const t = useT();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const session = apiContext.get().sessionVersion;
    try {
      await undoCompletion(activityId);
      if (session === apiContext.get().sessionVersion) onDone();
    } catch (error) {
      if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), getApiErrorMessage(error, t, 'common.networkError'));
    } finally { pending.current = false; setBusy(false); }
  };
  return <ActionButton label={t('taskEngine.undo')} loading={busy} disabled={busy} variant="secondary" onPress={() => { void undo(); }} />;
}
