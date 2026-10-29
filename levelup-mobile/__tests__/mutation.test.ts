import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { apiContext } from '../services/api-context';
import { mutate } from '../services/mutation';

afterEach(() => jest.restoreAllMocks());

const response = { data: { id: 'saved-on-server' } } as any;

test('an uncertain write reuses its persisted key after a token refresh', async () => {
  apiContext.setToken('old-token', 'user-1');
  const send = jest.spyOn(api, 'request').mockRejectedValueOnce({ code: 'ECONNABORTED' }).mockResolvedValueOnce(response);
  const body = { title: 'Read', type: 'STUDY' };
  await expect(mutate('post', '/planned-activities', body)).rejects.toMatchObject({ code: 'ECONNABORTED' });
  const firstKey = send.mock.calls[0][0].headers?.['Idempotency-Key'];
  expect(firstKey).toBeTruthy();
  apiContext.setToken('new-token', 'user-1');
  await expect(mutate('post', '/planned-activities', body)).resolves.toEqual(response.data);
  expect(send.mock.calls[1][0].headers?.['Idempotency-Key']).toBe(firstKey);
  expect((await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('mutation:'))).toHaveLength(0);
});

test('concurrent identical writes share a single request', async () => {
  apiContext.setToken('token', 'user-1');
  let finish!: (value: any) => void;
  const send = jest.spyOn(api, 'request').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = mutate('post', '/planned-activities', { title: 'Read' });
  const second = mutate('post', '/planned-activities', { title: 'Read' });
  await new Promise((resolve) => setImmediate(resolve));
  expect(send).toHaveBeenCalledTimes(1);
  finish(response);
  expect(await first).toEqual(await second);
});

test('storage failure prevents sending a write without a durable retry key', async () => {
  apiContext.setToken('token', 'user-1');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage full'));
  const send = jest.spyOn(api, 'request');
  await expect(mutate('post', '/planned-activities', {})).rejects.toThrow('Storage full');
  expect(send).not.toHaveBeenCalled();
});

test('a confirmed validation failure clears the key; different users never share one', async () => {
  apiContext.setToken('token-1', 'user-1');
  const send = jest.spyOn(api, 'request').mockRejectedValueOnce({ response: { status: 400 } }).mockResolvedValueOnce(response);
  await expect(mutate('post', '/planned-activities', {})).rejects.toMatchObject({ response: { status: 400 } });
  const firstKey = send.mock.calls[0][0].headers?.['Idempotency-Key'];
  apiContext.setToken('token-2', 'user-2');
  await mutate('post', '/planned-activities', {});
  expect(send.mock.calls[1][0].headers?.['Idempotency-Key']).not.toBe(firstKey);
});

test('undo retry after lost response reuses its persisted idempotency key', async () => {
  apiContext.setToken('token', 'owner');
  const post = jest.spyOn(api, 'request');
  post.mockRejectedValueOnce(new Error('lost response'));
  await expect(mutate('post', '/activities/completion-1/undo')).rejects.toThrow('lost response');
  const key = post.mock.calls.at(-1)![0]!.headers!['Idempotency-Key'];
  post.mockResolvedValueOnce({ data: { undone: true } });
  await expect(mutate('post', '/activities/completion-1/undo')).resolves.toEqual({ undone: true });
  expect(post.mock.calls.at(-1)![0]!.headers!['Idempotency-Key']).toBe(key);
});
