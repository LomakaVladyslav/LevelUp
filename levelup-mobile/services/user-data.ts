import AsyncStorage from '@react-native-async-storage/async-storage';

const DELETION_PREFIX = 'pendingAccountCleanup:';
const blocked = new Set<string>();
const queues = new Map<string, Promise<unknown>>();
function queued<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(owner) ?? Promise.resolve()).then(action, action);
  queues.set(owner, next.catch(() => undefined));
  return next;
}

export const userData = {
  saveDraft: (owner: string, value: string) => queued(owner, async () => {
    if (!blocked.has(owner)) await AsyncStorage.setItem(`activityDraft:${owner}`, value);
  }),
  readDraft: (owner: string) => queued(owner, async () => blocked.has(owner) ? null : AsyncStorage.getItem(`activityDraft:${owner}`)),
  removeDraft: (owner: string) => queued(owner, () => AsyncStorage.removeItem(`activityDraft:${owner}`)),
  beginDeletion: (owner: string) => {
    // Block immediately, then wait for any in-flight disk write before deleting it.
    blocked.add(owner);
    return queued(owner, () => AsyncStorage.setItem(`${DELETION_PREFIX}${owner}`, 'true'));
  },
  purge: (owner: string) => {
    blocked.add(owner);
    return queued(owner, () => AsyncStorage.removeItem(`activityDraft:${owner}`));
  },
  pendingDeletions: async () => (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(DELETION_PREFIX)).map(key => key.slice(DELETION_PREFIX.length)),
  finishDeletion: (owner: string) => AsyncStorage.removeItem(`${DELETION_PREFIX}${owner}`),
};
