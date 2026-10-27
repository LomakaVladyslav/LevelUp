import { useDataRevision } from '../stores/data.store';
import { plannedActivityService } from '../services/plannedActivity.service';
import { apiContext } from '../services/api-context';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useSegments } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { notificationService } from '../services/notification.service';
import { themes } from '../constants/theme';
export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { token, isLoading, loadFromStorage } = useAuthStore();
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const settingsLoaded = useSettingsStore((s) => s.settingsLoaded);
  const revision = useDataRevision((state) => state.revision);
  const language = useSettingsStore((s) => s.language);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const segments: string[] = useSegments();
  const theme = themes[themeMode];
  const resettingPassword = segments[0] === 'auth' && segments[1] === 'reset-password';

  useEffect(() => {
    notificationService.configure();
    void loadSettings();
    void loadFromStorage();
  }, [loadFromStorage, loadSettings]);

  useEffect(() => {
    if (token) void useAuthStore.getState().refreshUser().catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !settingsLoaded) return;
    let active = true;
    let sequence = 0;
    const session = apiContext.get().sessionVersion;
    const sync = async () => {
      const request = ++sequence;
      try {
        const { plannedActivities } = await plannedActivityService.getAll();
        if (active && request === sequence && session === apiContext.get().sessionVersion) await notificationService.reconcileReminders(plannedActivities, language, notificationsEnabled);
      } catch { /* Keep already scheduled reminders when the server is unreachable. */ }
    };
    void sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    return () => { active = false; subscription.remove(); };
  }, [token, settingsLoaded, language, notificationsEnabled, revision]);

  if (isLoading || !settingsLoaded) return <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
    <ActivityIndicator size="large" color={theme.colors.primary} />
  </View>;

  return <>
    <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!token || resettingPassword}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  </>;
}
