import { userData } from '../services/user-data';
import { useSettingsStore } from './settings.store';
import { create } from 'zustand';
import { authService } from '../services/auth.service';
import { sessionStorage } from '../services/session-storage';
import { apiContext } from '../services/api-context';
import { notificationService } from '../services/notification.service';
import { User } from '../types';

interface AuthStore {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  setUser: (user: User, authoritative?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

let generation = 0;
let userRevision = 0;
let storageQueue: Promise<unknown> = Promise.resolve();
const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = storageQueue.then(operation, operation);
  storageQueue = next.catch(() => undefined);
  return next;
};
const reportStorageError = () => console.warn('Could not update the local session cache');
export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null, user: null, isLoading: true,
  setAuth: async (token, user) => {
    const previousOwner = get().user?.id;
    const version = ++generation;
    ++userRevision;
    await serialize(async () => {
      if (version !== generation) return;
      await sessionStorage.write(token, user);
    });
    if (version !== generation) return;
    if (previousOwner && previousOwner !== user.id) {
      apiContext.setToken(null);
      set({ token: null, user: null, isLoading: false });
      await Promise.all([notificationService.cancelAllReminders(), useSettingsStore.getState().resetNotifications()]);
      if (version !== generation) return;
    }
    apiContext.setToken(token, user.id);
    set({ token, user, isLoading: false });
  },
  setUser: async (user, authoritative = false) => {
    if (!get().token || get().user?.id !== user.id) return;
    // Profile save responses can be stale; a revision-checked refresh is authoritative
    // and must accept lower XP/level after a server-side Undo.
    if (!authoritative) user = { ...user, xp: get().user!.xp, level: get().user!.level };
    ++userRevision;
    const version = generation;
    const token = get().token!;
    set({ user });
    await serialize(async () => {
      if (version === generation) await sessionStorage.write(token, user);
    }).catch(reportStorageError);
  },
  refreshUser: async () => {
    if (!get().token) return;
    const version = generation;
    const revision = ++userRevision;
    const user = await authService.getMe();
    if (version !== generation || revision !== userRevision) return;
    await get().setUser(user, true);
  },
  logout: async () => {
    ++generation;
    ++userRevision;
    apiContext.setToken(null);
    set({ token: null, user: null, isLoading: false });
    await Promise.allSettled([
      serialize(() => sessionStorage.clear()),
      notificationService.cancelAllReminders(),
      useSettingsStore.getState().resetNotifications(),
    ]).then((results) => {
      if (results.some((result) => result.status === 'rejected')) reportStorageError();
    });
  },
  deleteAccount: async () => {
    const owner = get().user?.id;
    if (!owner || !get().token) return;
    const session = apiContext.get().sessionVersion;
    await authService.deleteMe();
    const marked = userData.beginDeletion(owner);
    const active = session === apiContext.get().sessionVersion;
    if (active) {
      ++generation;
      ++userRevision;
      apiContext.setToken(null);
      set({ token: null, user: null, isLoading: false });
    }
    // Enqueue device cleanup immediately so a subsequent login queues after it.
    const deviceCleanup = active ? Promise.all([
      notificationService.cancelAllReminders(),
      useSettingsStore.getState().resetNotifications(),
    ]) : Promise.resolve();
    const sessionCleanup = serialize(() => sessionStorage.clearOwner(owner));
    const results = await Promise.allSettled([marked, userData.purge(owner), deviceCleanup, sessionCleanup]);
    if (results.some(result => result.status === 'rejected')) throw new Error('LOCAL_CLEANUP_PENDING');
    await userData.finishDeletion(owner).catch(() => { throw new Error('LOCAL_CLEANUP_PENDING'); });
  },
  loadFromStorage: async () => {
    const version = generation;
    try {
      const session = await serialize(async () => {
        // Resume interrupted deletion before any account or personal screen is restored.
        const restored = await sessionStorage.read();
        for (const owner of await userData.pendingDeletions()) {
          await userData.purge(owner);
          await sessionStorage.clearOwner(owner);
          if (!restored || restored.user.id === owner) {
            await notificationService.cancelAllReminders();
            await useSettingsStore.getState().resetNotifications();
          }
          await userData.finishDeletion(owner);
        }
        return sessionStorage.read();
      });
      if (version !== generation) return;
      if (session) {
        apiContext.setToken(session.token, session.user.id);
        set({ token: session.token, user: session.user, isLoading: false });
      } else {
        apiContext.setToken(null);
        set({ token: null, user: null, isLoading: false });
      }
    } catch {
      if (version === generation) { apiContext.setToken(null); set({ token: null, user: null, isLoading: false }); }
    }
  },
  updateUser: (updates) => {
    const user = get().user;
    if (user) void get().setUser({ ...user, ...updates, id: user.id }, true);
  },
}));

apiContext.onSessionExpired(() => { void useAuthStore.getState().logout(); });
