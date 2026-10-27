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
  setUser: (user: User) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
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
    const version = ++generation;
    ++userRevision;
    await serialize(async () => {
      if (version !== generation) return;
      await sessionStorage.write(token, user);
    });
    if (version !== generation) return;
    apiContext.setToken(token, user.id);
    set({ token, user, isLoading: false });
  },
  setUser: async (user) => {
    if (!get().token || get().user?.id !== user.id) return;
    // Profile saves can arrive after a newer completion response. Rewards are
    // monotonic; an older profile snapshot must not roll back displayed progress.
    user = { ...user, xp: Math.max(user.xp, get().user!.xp), level: Math.max(user.level, get().user!.level) };
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
    await get().setUser(user);
  },
  logout: async () => {
    ++generation;
    ++userRevision;
    apiContext.setToken(null);
    set({ token: null, user: null, isLoading: false });
    await Promise.allSettled([
      serialize(() => sessionStorage.clear()),
      notificationService.cancelAllReminders(),
    ]).then((results) => {
      if (results.some((result) => result.status === 'rejected')) reportStorageError();
    });
  },
  loadFromStorage: async () => {
    const version = generation;
    try {
      const session = await serialize(() => sessionStorage.read());
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
    if (user) void get().setUser({ ...user, ...updates, id: user.id });
  },
}));

apiContext.onSessionExpired(() => { void useAuthStore.getState().logout(); });
