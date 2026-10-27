import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useScreenResource } from '../hooks/useScreenResource';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { apiContext } from '../services/api-context';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  useSettingsStore.setState({ language: 'en' });
  useAuthStore.setState({ user: null, token: null });
});

test('an older load cannot overwrite a more recent reload', async () => {
  const old = deferred<string>(); const latest = deferred<string>();
  const fetch = jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  const { result } = await renderHook(() => useScreenResource(fetch));
  let reload!: Promise<unknown>;
  await act(() => { reload = result.current.reload(); });
  await act(async () => { latest.resolve('new'); await reload; });
  await act(async () => { old.resolve('old'); await old.promise; });
  expect(result.current.data).toBe('new');
  expect(result.current.loading).toBe(false);
});

test('refresh failure retains confirmed data and exposes a retryable error', async () => {
  const fetch = jest.fn().mockResolvedValueOnce(['saved']).mockRejectedValueOnce(new Error('Offline'));
  const { result } = await renderHook(() => useScreenResource(fetch));
  await waitFor(() => expect(result.current.data).toEqual(['saved']));
  await act(async () => { await result.current.reload(); });
  expect(result.current.data).toEqual(['saved']);
  expect(result.current.error).toEqual(new Error('Offline'));
  expect(result.current.refreshing).toBe(false);
});

test('a response from a previous session is discarded', async () => {
  const pending = deferred<string>();
  const { result } = await renderHook(() => useScreenResource(() => pending.promise));
  apiContext.setToken('different-session', 'user-2');
  await act(async () => { pending.resolve('old user data'); await pending.promise; });
  expect(result.current.data).toBeNull();
});

test('a language change ignores the old language response', async () => {
  const english = deferred<string>(); const ukrainian = deferred<string>();
  const fetch = jest.fn().mockReturnValueOnce(english.promise).mockReturnValueOnce(ukrainian.promise);
  const { result } = await renderHook(() => useScreenResource(fetch));
  await act(() => { useSettingsStore.setState({ language: 'uk' }); });
  await act(async () => { ukrainian.resolve('Українська'); await ukrainian.promise; });
  await act(async () => { english.resolve('English'); await english.promise; });
  expect(result.current.data).toBe('Українська');
});

test('switching accounts removes already loaded private data before the new request finishes', async () => {
  const next = deferred<string>();
  const fetch = jest.fn().mockResolvedValueOnce('private data from account A').mockReturnValueOnce(next.promise);
  const { result } = await renderHook(() => useScreenResource(fetch));
  await waitFor(() => expect(result.current.data).toBe('private data from account A'));
  await act(() => {
    apiContext.setToken('user-b-token', 'user-b');
    useAuthStore.setState({ user: { id: 'user-b', email: 'b@example.test', username: 'B', xp: 0, level: 1 } });
  });
  expect(result.current.data).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => { next.resolve('account B'); await next.promise; });
  expect(result.current.data).toBe('account B');
});
