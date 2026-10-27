import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const SESSION_KEY = 'levelup.session';
const LEGACY_SECURE_TOKEN_KEY = 'levelup.session.token';
const LOGGED_OUT_KEY = 'levelup.loggedOut';

type Session = { token: string; user: User };
const isSession = (value: unknown): value is Session => {
  const session = value as Session | null;
  const user = session?.user;
  return !!session && typeof session.token === 'string' && !!session.token && !!user &&
    typeof user.id === 'string' && !!user.id && typeof user.username === 'string' &&
    typeof user.email === 'string' && Number.isFinite(user.xp) && Number.isFinite(user.level);
};

export const sessionStorage = {
  read: async (): Promise<Session | null> => {
    // This marker prevents restoration even if secure deletion failed during logout.
    if (await AsyncStorage.getItem(LOGGED_OUT_KEY) === 'true') return null;
    const stored = await SecureStore.getItemAsync(SESSION_KEY);
    if (stored) {
      const session: unknown = JSON.parse(stored);
      return isSession(session) ? session : null;
    }
    const token = await SecureStore.getItemAsync(LEGACY_SECURE_TOKEN_KEY) ?? await AsyncStorage.getItem('token');
    const userJson = await AsyncStorage.getItem('user');
    const session: unknown = { token, user: userJson ? JSON.parse(userJson) : null };
    if (!isSession(session)) return null;
    await sessionStorage.write(session.token, session.user);
    return session;
  },
  write: async (token: string, user: User) => {
    // Credentials and their owner are one atomic secure item, never two mismatched writes.
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ token, user }));
    await AsyncStorage.removeItem(LOGGED_OUT_KEY);
    await Promise.allSettled([
      SecureStore.deleteItemAsync(LEGACY_SECURE_TOKEN_KEY),
      AsyncStorage.multiRemove(['token', 'user']),
    ]);
  },
  clearOwner: async (owner: string) => {
    const stored = await SecureStore.getItemAsync(SESSION_KEY);
    if (stored && JSON.parse(stored)?.user?.id === owner) {
      // Keep ownership evidence until every legacy credential has been removed,
      // so a partial storage failure can be retried safely on the next launch.
      await SecureStore.deleteItemAsync(LEGACY_SECURE_TOKEN_KEY);
      await AsyncStorage.multiRemove(['token', 'user']);
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
    const legacy = await AsyncStorage.getItem('user');
    if (legacy && JSON.parse(legacy)?.id === owner) {
      await SecureStore.deleteItemAsync(LEGACY_SECURE_TOKEN_KEY);
      await AsyncStorage.multiRemove(['token', 'user']);
    }
  },
  clear: async () => {
    const results = await Promise.allSettled([
      AsyncStorage.setItem(LOGGED_OUT_KEY, 'true'),
      SecureStore.deleteItemAsync(SESSION_KEY),
      SecureStore.deleteItemAsync(LEGACY_SECURE_TOKEN_KEY),
      AsyncStorage.multiRemove(['token', 'user']),
    ]);
    // Either a persisted logout marker or deletion of every credential blocks restoration.
    if (results[0].status === 'rejected' && results.slice(1).some((result) => result.status === 'rejected')) {
      throw new Error('Could not clear the saved session');
    }
  },
};
