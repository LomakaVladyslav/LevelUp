import { apiContext } from '../services/api-context';
import { authService } from '../services/auth.service';
import { prepareAvatar } from '../services/avatar';
import api from '../services/api';
jest.mock('../services/avatar', () => ({ prepareAvatar: jest.fn() }));

test('account switch during image preparation cannot upload an old photo to the new owner', async () => {
  apiContext.setToken('old-token', 'old-owner');
  let finish!: (uri: string) => void;
  jest.mocked(prepareAvatar).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const post = jest.spyOn(api, 'post');
  const upload = authService.updateAvatar('file:///private/photo.jpg');
  apiContext.setToken('new-token', 'new-owner');
  finish('file:///prepared.jpg');
  await expect(upload).rejects.toThrow('Session changed');
  expect(post).not.toHaveBeenCalled();
  post.mockRestore();
});
test('deletion explicitly binds the request to its initiating session', async () => {
  apiContext.setToken('old-token', 'old-owner');
  const remove = jest.spyOn(api, 'delete').mockResolvedValue({});
  const deletion = authService.deleteMe();
  apiContext.setToken('new-token', 'new-owner');
  await deletion;
  expect(remove).toHaveBeenCalledWith('/auth/me', { headers: { Authorization: 'Bearer old-token' } });
  remove.mockRestore();
});
