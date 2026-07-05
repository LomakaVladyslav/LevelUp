import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AxiosAdapter, AxiosResponse } from 'axios';
import api, {
  DEFAULT_API_BASE_URL,
  getAssetUrl,
  normalizeApiBaseUrl,
} from '../services/api';

test('normalizes API base URLs with a stable /api suffix', () => {
  expect(normalizeApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
  expect(normalizeApiBaseUrl('https://example.com')).toBe('https://example.com/api');
  expect(normalizeApiBaseUrl('https://example.com/api/')).toBe('https://example.com/api');
});

test('builds asset URLs from relative upload paths', () => {
  expect(getAssetUrl(null)).toBeNull();
  expect(getAssetUrl('https://cdn.example.com/avatar.png')).toBe(
    'https://cdn.example.com/avatar.png',
  );
  expect(getAssetUrl('/uploads/avatar.png')).toBe(
    `${DEFAULT_API_BASE_URL.replace(/\/api$/, '')}/uploads/avatar.png`,
  );
});

test('request interceptor attaches auth token and selected language', async () => {
  await AsyncStorage.multiSet([
    ['token', 'jwt-token'],
    ['language', 'uk'],
  ]);

  const originalAdapter = api.defaults.adapter;
  const adapter: AxiosAdapter = async (config) => ({
    config,
    data: { ok: true },
    headers: {},
    status: 200,
    statusText: 'OK',
  } as AxiosResponse);

  api.defaults.adapter = adapter;
  const response = await api.get('/health');
  api.defaults.adapter = originalAdapter;

  expect(response.config.headers?.Authorization).toBe('Bearer jwt-token');
  expect(response.config.headers?.['Accept-Language']).toBe('uk');
});
