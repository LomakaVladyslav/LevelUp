import { act, render } from '@testing-library/react-native';
import { privateAvatarSource } from '../services/avatar';
import { ASSET_BASE_URL } from '../services/api';
import { UserAvatar } from '../components/UserAvatar';
import { useAuthStore } from '../stores/auth.store';

test('only controlled same-origin avatar URLs receive authorization', () => {
  expect(privateAvatarSource('/api/avatars/1234-abcd', 'secret')).toEqual({ uri: `${ASSET_BASE_URL}/api/avatars/1234-abcd`, headers: { Authorization: 'Bearer secret' }, cache: 'reload' });
  expect(privateAvatarSource('/uploads/avatars/own.jpg', 'secret')).not.toBeNull();
  for (const url of ['https://other.test/api/avatars/abcd', '//other.test/uploads/avatars/own.jpg', '/api/auth/me', '/uploads/avatars/a.jpg?redirect=1', 'file:///private/avatar.jpg', '/uploads/avatars/../secret.jpg']) {
    expect(privateAvatarSource(url, 'secret')).toBeNull();
  }
  expect(privateAvatarSource('/api/avatars/abcd', null)).toBeNull();
});
test('avatar component sends authorization and removes the image on logout', async () => {
  useAuthStore.setState({ token: 'secret' });
  const view = await render(<UserAvatar username="Owner" avatarUrl="/uploads/avatars/own.jpg" />);
  expect(view.getByTestId('user-avatar').props.source.headers.Authorization).toBe('Bearer secret');
  await act(async () => { useAuthStore.setState({ token: null }); });
  await view.rerender(<UserAvatar username="Owner" avatarUrl="/uploads/avatars/own.jpg" />);
  expect(view.queryByText('O')).not.toBeNull();
});
