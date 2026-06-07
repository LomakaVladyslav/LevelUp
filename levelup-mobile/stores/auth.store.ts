import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/auth.service';
import { User } from '../types';

interface AuthStore {
  token: string | null;
  user: User | null;
  isLoading: boolean;

  // Actions
  setAuth: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  // Called after login or register
  setAuth: async (token, user) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },

  setUser: async (user) => {
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  refreshUser: async () => {
    const user = await authService.getMe();
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  // Called on logout button press
  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    set({ token: null, user: null });
  },

  // Called on app start to restore session
  loadFromStorage: async () => {
    try {
      const [token, userJson] = await Promise.all([
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('user'),
      ]);

      if (token && userJson) {
        set({ token, user: JSON.parse(userJson), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  // Used after leveling up or earning XP
  updateUser: (updates) => {
    set((state) => {
      const user = state.user ? { ...state.user, ...updates } : null;

      if (user) {
        void AsyncStorage.setItem('user', JSON.stringify(user));
      }

      return { user };
    });
  },
}));
