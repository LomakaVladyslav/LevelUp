import { useDataRevision } from '../stores/data.store';
import { plannedActivityService } from '../services/plannedActivity.service';
import { apiContext } from '../services/api-context';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useSegments, useRouter, useNavigationContainerRef } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { observeTaskNotifications } from '../services/notification-response';
import { notificationService } from '../services/notification.service';
import { themes } from '../constants/theme';
export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const userId = useAuthStore((s) => s.user?.id);
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
      const dataRevision = useDataRevision.getState().revision;
      try {
        const { plannedActivities } = await plannedActivityService.getAll();
        if (active && request === sequence && session === apiContext.get().sessionVersion && dataRevision === useDataRevision.getState().revision) await notificationService.reconcileReminders(plannedActivities, language, notificationsEnabled);
      } catch { /* Keep already scheduled reminders when the server is unreachable. */ }
    };
    if (!notificationsEnabled) void notificationService.cancelAllReminders().catch(() => undefined);
    else void sync();
    // Refresh around midnight while the app remains foregrounded as well.
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [token, settingsLoaded, language, notificationsEnabled, revision]);

  useEffect(() => {
    if (!token || !userId || isLoading || !settingsLoaded) return;
    return observeTaskNotifications(userId, (id) => router.push({ pathname: '/(tabs)/activities', params: { taskId: id } }), {
      isReady: () => navigation.isReady(),
      subscribe: (flush) => {
        const stopState = navigation.addListener('state', flush);
        const stopReady = navigation.addListener('ready', flush);
        return () => { stopState(); stopReady(); };
      },
    });
  }, [token, userId, isLoading, settingsLoaded, router, navigation]);

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
