import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { notificationService } from '../services/notification.service';

export default function RootLayout() {
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const router = useRouter();
  const segments = useSegments();

  // Restore session from AsyncStorage on app start
  useEffect(() => {
    notificationService.configure();
    void loadSettings();
    loadFromStorage();
  }, [loadFromStorage, loadSettings]);

  // Redirect based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!token && !inAuthGroup) {
      // Not logged in, go to login screen
      router.replace('/auth/login');
    } else if (token && inAuthGroup) {
      // Already logged in, go to home
      router.replace('/(tabs)');
    }
  }, [token, isLoading, segments, router]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
