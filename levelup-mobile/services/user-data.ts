import AsyncStorage from '@react-native-async-storage/async-storage';

const scopedKey = (owner: string, kind: string, id: string) => `userData:${encodeURIComponent(owner)}:${kind}:${encodeURIComponent(id)}`;
const draftKey = (owner: string, taskId?: string) => taskId ? scopedKey(owner, 'draft', taskId) : `activityDraft:${owner}`;
const DELETION_PREFIX = 'pendingAccountCleanup:';
const blocked = new Set<string>();
const queues = new Map<string, Promise<unknown>>();
function queued<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(owner) ?? Promise.resolve()).then(action, action);
  queues.set(owner, next.catch(() => undefined));
  return next;
}

export const userData = {
  saveDraft: (owner: string, value: string, taskId?: string) => queued(owner, async () => {
    if (!blocked.has(owner)) await AsyncStorage.setItem(draftKey(owner, taskId), value);
  }),
  readDraft: (owner: string, taskId?: string) => queued(owner, async () => blocked.has(owner) ? null : AsyncStorage.getItem(draftKey(owner, taskId))),
  removeDraft: (owner: string, taskId?: string) => queued(owner, () => AsyncStorage.removeItem(draftKey(owner, taskId))),
  saveCache: (owner: string, key: string, data: unknown) => queued(owner, async () => {
    if (!blocked.has(owner)) await AsyncStorage.setItem(scopedKey(owner, 'cache', key), JSON.stringify({ version: 1, savedAt: Date.now(), data }));
  }),
  readCache: (owner: string, key: string) => queued(owner, async () => {
    if (blocked.has(owner)) return null;
    try {
      const raw = await AsyncStorage.getItem(scopedKey(owner, 'cache', key));
      const value = raw ? JSON.parse(raw) : null;
      return value?.version === 1 && Number.isFinite(value.savedAt) && value.data != null ? value : null;
    } catch { return null; }
  }),
  setReminder: (owner: string, taskId: string, enabled: boolean) => queued(owner, async () => {
    if (!blocked.has(owner)) await AsyncStorage.setItem(scopedKey(owner, 'reminder', taskId), String(enabled));
  }),
  reminderEnabled: (owner: string, taskId: string) => queued(owner, async () => !blocked.has(owner) && await AsyncStorage.getItem(scopedKey(owner, 'reminder', taskId)) !== 'false'),
  beginDeletion: (owner: string) => {
    // Block immediately, then wait for any in-flight disk write before deleting it.
    blocked.add(owner);
    return queued(owner, () => AsyncStorage.setItem(`${DELETION_PREFIX}${owner}`, 'true'));
  },
  purge: (owner: string) => {
    blocked.add(owner);
    return queued(owner, async () => {
      await AsyncStorage.removeItem(`activityDraft:${owner}`);
      const prefix = `userData:${encodeURIComponent(owner)}:`;
      await AsyncStorage.multiRemove((await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix)));
    });
  },
  pendingDeletions: async () => (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(DELETION_PREFIX)).map(key => key.slice(DELETION_PREFIX.length)),
  finishDeletion: (owner: string) => AsyncStorage.removeItem(`${DELETION_PREFIX}${owner}`),
};
