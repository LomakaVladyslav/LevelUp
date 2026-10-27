import { apiContext } from '../services/api-context';
import { plannedActivityService } from '../services/plannedActivity.service';
import { invalidateData } from '../stores/data.store';
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
  apiContext.setToken('jwt-token');
  apiContext.setLanguage('uk');

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

test('401 from an old request cannot expire a newer session', async () => {
  const expire = jest.fn();
  apiContext.onSessionExpired(expire);
  apiContext.setToken('new-token', 'user-1');
  apiContext.expire('Bearer old-token');
  expect(expire).not.toHaveBeenCalled();
  apiContext.expire('Bearer new-token');
  expect(expire).toHaveBeenCalledTimes(1);
});

test('login requests do not carry a saved bearer token', async () => {
  apiContext.setToken('existing-token', 'user-1');
  const originalAdapter = api.defaults.adapter;
  api.defaults.adapter = async (config) => ({ config, data: {}, headers: {}, status: 200, statusText: 'OK' });
  try {
    const response = await api.post('/auth/login', { email: 'user@example.com', password: 'wrong' });
    expect(response.config.headers?.Authorization).toBeUndefined();
  } finally { api.defaults.adapter = originalAdapter; }
});

test('rejects credentials, unrelated paths and invalid API origins', () => {
  for (const url of ['https://user:pass@example.com', 'https://example.com/wrong', 'file:///api', 'https://example.com?secret=value', 'https://example.com:999999']) {
    expect(() => normalizeApiBaseUrl(url)).toThrow();
  }
});

test('simultaneous task reads share a request but writes and account changes invalidate it', async () => {
  let finish!: (data: any) => void;
  const read = jest.spyOn(api, 'get').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  try {
    const first = plannedActivityService.getAll();
    const second = plannedActivityService.getAll();
    expect(read).toHaveBeenCalledTimes(1);
    finish({ data: { plannedActivities: [], todayProgress: {} } });
    await Promise.all([first, second]);
    const third = plannedActivityService.getAll();
    const finishThird = finish;
    invalidateData();
    const afterWrite = plannedActivityService.getAll();
    const finishWrite = finish;
    apiContext.setToken('another', 'another-user');
    const anotherUser = plannedActivityService.getAll();
    finish({ data: {} }); finishWrite({ data: {} }); finishThird({ data: {} });
    await Promise.all([third, afterWrite, anotherUser]);
    expect(read).toHaveBeenCalledTimes(4);
  } finally { read.mockRestore(); }
});
