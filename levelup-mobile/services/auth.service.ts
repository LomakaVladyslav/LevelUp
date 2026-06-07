import api from './api';
import { User } from '../types';

const appendAvatar = (formData: FormData, avatarUri?: string | null) => {
  if (!avatarUri) return;

  const name = avatarUri.split('/').pop() || 'avatar.jpg';
  const extension = name.split('.').pop()?.toLowerCase();
  const type = extension === 'png' ? 'image/png' : 'image/jpeg';

  formData.append('avatar', {
    uri: avatarUri,
    name,
    type,
  } as any);
};

export const authService = {
  register: async (
    email: string,
    username: string,
    password: string,
    age?: number | null,
    avatarUri?: string | null,
  ) => {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('username', username);
    formData.append('password', password);
    if (age !== undefined && age !== null) {
      formData.append('age', String(age));
    }
    appendAvatar(formData, avatarUri);

    const { data } = await api.post('/auth/register', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data as { token: string; user: User };
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data as { token: string; user: User };
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data.user as User;
  },

  updateMe: async (updates: { age?: number | null }) => {
    const { data } = await api.patch('/auth/me', updates);
    return data.user as User;
  },

  updateAvatar: async (avatarUri: string) => {
    const formData = new FormData();
    appendAvatar(formData, avatarUri);

    const { data } = await api.post('/auth/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.user as User;
  },

  deleteMe: async () => {
    await api.delete('/auth/me');
  },
};
