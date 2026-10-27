import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import api from './api';
import { invalidateData } from '../stores/data.store';
import { apiContext } from './api-context';

const inFlight = new Map<string, Promise<unknown>>();

// Persist the key before sending. An uncertain result keeps it for an explicit retry,
// including after app restart. Never automatically replay writes in the background.
export async function mutate<T>(method: 'post' | 'patch', path: string, body: unknown = {}): Promise<T> {
  const context = apiContext.get();
  if (!context.token) throw new Error('Sign in to save changes');
  const fingerprint = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([context.userId ?? context.token, method, path, body]));
  const storageKey = `mutation:${fingerprint}`;
  const existing = inFlight.get(storageKey);
  if (existing) return existing as Promise<T>;
  const operation = (async () => {
    const key = await AsyncStorage.getItem(storageKey) ?? randomUUID();
    await AsyncStorage.setItem(storageKey, key);
    if (apiContext.get().sessionVersion !== context.sessionVersion) throw new Error('Session changed');
    try {
      const response = await api.request<T>({ method, url: path, data: body, headers: {
        'Idempotency-Key': key, Authorization: `Bearer ${context.token}`,
      } });
      await AsyncStorage.removeItem(storageKey).catch(() => undefined);
      if (apiContext.get().sessionVersion === context.sessionVersion) invalidateData();
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      if (status >= 400 && status < 500 && ![408, 429].includes(status)) {
        await AsyncStorage.removeItem(storageKey).catch(() => undefined);
      }
      throw error;
    }
  })();
  inFlight.set(storageKey, operation);
  try { return await operation; }
  finally { inFlight.delete(storageKey); }
}
