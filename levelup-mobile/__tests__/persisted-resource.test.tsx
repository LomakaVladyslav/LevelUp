import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userData } from '../services/user-data';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { apiContext } from '../services/api-context';
import { useScreenResource } from '../hooks/useScreenResource';
const user = (id: string) => ({ id, username: id, email: `${id}@example.test`, xp: 0, level: 1 });
const owner = (id: string) => { apiContext.setToken(`token-${id}`, id); useAuthStore.setState({ user: user(id), token: `token-${id}` }); };
afterEach(() => jest.useRealTimers());
beforeEach(() => { owner('cache-a'); useSettingsStore.setState({ language: 'en' }); });
test('cold start restores last successful read even when network never resolves', async () => {
  const first = await renderHook(() => useScreenResource(async () => ['saved'], 'tasks'));
  await waitFor(() => expect(first.result.current.data).toEqual(['saved']));
  await first.unmount();
  const next = await renderHook(() => useScreenResource(() => new Promise<string[]>(() => {}), 'tasks'));
  await waitFor(() => expect(next.result.current.data).toEqual(['saved']));
  expect(next.result.current.cached).toBe(true);
  expect(next.result.current.loading).toBe(false);
  expect(next.result.current.savedAt).toEqual(expect.any(Number));
});
test('offline read is isolated across account switch and logout', async () => {
  await userData.saveCache('cache-a', 'tasks:en', ['private A']);
  await userData.saveCache('cache-b', 'tasks:en', ['private B']);
  const { result } = await renderHook(() => useScreenResource(() => Promise.reject(new Error('offline')), 'tasks'));
  await waitFor(() => expect(result.current.data).toEqual(['private A']));
  await act(() => owner('cache-b'));
  expect(result.current.data).not.toEqual(['private A']);
  await waitFor(() => expect(result.current.data).toEqual(['private B']));
  await act(async () => { await useAuthStore.getState().logout(); });
  expect(result.current.data).toBeNull();
  expect((await userData.readCache('cache-a', 'tasks:en'))?.data).toEqual(['private A']);
});
test('reconnect retry replaces stale disk data with authoritative data', async () => {
  jest.useFakeTimers();
  const originalState = AppState.currentState;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  await userData.saveCache('cache-a', 'tasks:en', ['old']);
  const fetch = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(['online']);
  const hook = await renderHook(() => useScreenResource(fetch, 'tasks'));
  await waitFor(() => expect(hook.result.current.data).toEqual(['old']));
  await act(async () => { jest.advanceTimersByTime(15000); });
  await waitFor(() => expect(hook.result.current.data).toEqual(['online']));
  expect(hook.result.current.cached).toBe(false);
  await hook.unmount();
  Object.defineProperty(AppState, 'currentState', { value: originalState, configurable: true });
  jest.useRealTimers();
});
test('foreground refresh replaces cached data after reconnection', async () => {
  let foreground!: (state: string) => void;
  const original = jest.mocked(AppState.addEventListener).getMockImplementation()!;
  const subscribe = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    foreground = listener as (state: string) => void; return { remove: jest.fn() };
  });
  await userData.saveCache('cache-a', 'tasks:en', ['old']);
  const fetch = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(['fresh']);
  const { result } = await renderHook(() => useScreenResource(fetch, 'tasks'));
  await waitFor(() => expect(result.current.data).toEqual(['old']));
  await act(async () => { foreground('active'); });
  await waitFor(() => expect(result.current.data).toEqual(['fresh']));
  expect(result.current.cached).toBe(false);
  expect(result.current.error).toBeNull();
  subscribe.mockImplementation(original);
});
test('corrupt and incompatible cache versions are ignored', async () => {
  const key = 'userData:cache-a:cache:tasks%3Aen';
  for (const value of ['invalid-json', JSON.stringify({ version: 2, savedAt: Date.now(), data: ['bad'] })]) {
    await AsyncStorage.setItem(key, value);
    expect(await userData.readCache('cache-a', 'tasks:en')).toBeNull();
  }
});
test('a late network response from A never writes into B cache', async () => {
  let resolve!: (value: string[]) => void;
  const fetch = jest.fn().mockReturnValueOnce(new Promise<string[]>(done => { resolve = done; })).mockResolvedValue(['B']);
  const { result } = await renderHook(() => useScreenResource(fetch, 'tasks'));
  await act(() => owner('cache-b'));
  await waitFor(() => expect(result.current.data).toEqual(['B']));
  await act(async () => resolve(['A']));
  expect((await userData.readCache('cache-b', 'tasks:en'))?.data).toEqual(['B']);
  expect(await userData.readCache('cache-a', 'tasks:en')).toBeNull();
});
test('delete cleanup removes all owner drafts, reads and reminder preferences; late writes cannot revive them', async () => {
  const deleted = 'delete-stage3';
  await userData.saveDraft(deleted, 'new');
  await userData.saveDraft(deleted, 'edit', 'task-1');
  await userData.saveCache(deleted, 'tasks:en', ['private']);
  await userData.setReminder(deleted, 'task-1', false);
  await userData.saveDraft('survivor', 'keep', 'task-1');
  await userData.saveCache('survivor', 'tasks:en', ['keep']);
  await userData.beginDeletion(deleted);
  await userData.purge(deleted);
  await userData.saveCache(deleted, 'tasks:en', ['late']);
  await userData.saveDraft(deleted, 'late edit', 'task-1');
  expect(await userData.readDraft(deleted)).toBeNull();
  expect(await userData.readDraft(deleted, 'task-1')).toBeNull();
  expect(await userData.readCache(deleted, 'tasks:en')).toBeNull();
  expect((await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`userData:${deleted}:`))).toEqual([]);
  expect(await userData.readDraft('survivor', 'task-1')).toBe('keep');
  expect((await userData.readCache('survivor', 'tasks:en'))?.data).toEqual(['keep']);
});
test('new and per-task edit drafts stay independent and save cleanup only removes the saved draft', async () => {
  await userData.saveDraft('cache-a', 'new');
  await userData.saveDraft('cache-a', 'edit one', 'one');
  await userData.saveDraft('cache-a', 'edit two', 'two');
  await userData.saveDraft('cache-b', 'B one', 'one');
  await userData.removeDraft('cache-a', 'one');
  expect(await userData.readDraft('cache-a', 'one')).toBeNull();
  expect(await userData.readDraft('cache-a', 'two')).toBe('edit two');
  expect(await userData.readDraft('cache-a')).toBe('new');
  expect(await userData.readDraft('cache-b', 'one')).toBe('B one');
});

test('a late disk read cannot overwrite a fresh server response', async () => {
  let finish!: (value: any) => void;
  const read = jest.spyOn(userData, 'readCache').mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { result } = await renderHook(() => useScreenResource(async () => ['server'], 'tasks'));
  await waitFor(() => expect(result.current.data).toEqual(['server']));
  await act(async () => finish({ version: 1, savedAt: Date.now(), data: ['disk'] }));
  expect(result.current.data).toEqual(['server']);
  expect(result.current.cached).toBe(false);
  read.mockRestore();
});
