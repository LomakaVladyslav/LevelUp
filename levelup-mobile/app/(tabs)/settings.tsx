import { notificationService } from '../../services/notification.service';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '../../services/auth.service';
import { apiContext } from '../../services/api-context';
import { useAuthStore } from '../../stores/auth.store';
import { useSettingsStore } from '../../stores/settings.store';
import { AppTheme, typography } from '../../constants/theme';
import { UserAvatar } from '../../components/UserAvatar';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ActionButton, pageContent } from '../../components/ScreenUi';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';

export default function SettingsScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const { user, setUser, deleteAccount } = useAuthStore();
  const { themeMode, setThemeMode, notificationsEnabled, setNotificationsEnabled } = useSettingsStore();
  const pending = useRef(false);
  const [operation, setOperation] = useState<'avatar' | 'delete' | null>(null);
  const notificationsPending = useRef(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [permission, setPermission] = useState<string>('undetermined');
  useEffect(() => {
    let active = true;
    const refresh = () => { void notificationService.getPermissionStatus().then((status) => { if (active) setPermission(status); }).catch(() => undefined); };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [updatingNotifications]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Both the confirmation and async result belong to the initiating session.
  const runProfileChange = async (kind: 'avatar' | 'delete', change: (isCurrent: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    const session = apiContext.get().sessionVersion;
    const isCurrent = () => mounted.current && session === apiContext.get().sessionVersion;
    pending.current = true;
    setOperation(kind);
    try { await change(isCurrent); }
    catch (error) { if (isCurrent()) Alert.alert(t('common.error'), getApiErrorMessage(error, t, kind === 'delete' ? 'settings.deleteFailed' : 'common.somethingWrong')); }
    finally { pending.current = false; if (mounted.current) setOperation(null); }
  };

  const pickAvatar = () => runProfileChange('avatar', async (isCurrent) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!isCurrent()) return;
    if (!permission.granted) { Alert.alert(t('image.permissionTitle'), t('image.permissionMessage')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!isCurrent() || result.canceled || !result.assets[0]?.uri) return;
    const updated = await authService.updateAvatar(result.assets[0].uri);
    if (isCurrent()) await setUser(updated);
  });
  const handleNotificationsChange = async (enabled: boolean) => {
    if (notificationsPending.current) return;
    notificationsPending.current = true;
    setUpdatingNotifications(true);
    try { await setNotificationsEnabled(enabled); }
    catch (error) {
      if (mounted.current) Alert.alert(t('common.error'), error instanceof Error && error.message === 'notifications.permissionDenied' ? t('notifications.permissionDenied') : t('common.somethingWrong'));
    } finally { notificationsPending.current = false; if (mounted.current) setUpdatingNotifications(false); }
  };
  const handleDeleteAccount = () => {
    const session = apiContext.get().sessionVersion;
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => {
        if (session !== apiContext.get().sessionVersion || !mounted.current) return;
        void runProfileChange('delete', async () => {
          try { await deleteAccount(); }
          catch (error) {
            if (error instanceof Error && error.message === 'LOCAL_CLEANUP_PENDING') Alert.alert(t('common.error'), t('settings.localCleanupPending'));
            else throw error;
          }
        });
      } },
    ]);
  };

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={pageContent}>
      <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <UserAvatar username={user?.username} avatarUrl={user?.avatarUrl} size={64} />
          <ActionButton style={{ flex: 1 }} label={t('register.changeAvatar')} variant="secondary" onPress={pickAvatar} disabled={Boolean(operation)} loading={operation === 'avatar'} />
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.settingTitle}>{t('common.language')}</Text>
        <LanguageSelector inline />
      </View>
      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{t('settings.notifications')}</Text>
          <Text style={styles.settingSubtitle}>{t('taskEngine.reminderHelp')}</Text>
          <Text style={styles.settingSubtitle}>{t(permission === 'granted' ? 'taskEngine.permissionGranted' : permission === 'denied' ? 'taskEngine.permissionDenied' : 'taskEngine.permissionUnknown')}</Text>
          {permission === 'denied' ? <ActionButton label={t('taskEngine.systemSettings')} variant="secondary" onPress={() => { void Linking.openSettings(); }} /> : null}
        </View>
        <Switch accessibilityLabel={t('settings.notifications')} value={notificationsEnabled} onValueChange={handleNotificationsChange} disabled={updatingNotifications || operation === 'delete'} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notificationsEnabled ? colors.primary : colors.textMuted} />
      </View>
      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{t('settings.darkTheme')}</Text>
          <Text style={styles.settingSubtitle}>{t('settings.darkThemeSubtitle')}</Text>
        </View>
        <Switch accessibilityLabel={t('settings.darkTheme')} value={themeMode === 'dark'} onValueChange={(enabled) => { void setThemeMode(enabled ? 'dark' : 'light').catch(() => Alert.alert(t('common.error'), t('common.somethingWrong'))); }} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={themeMode === 'dark' ? colors.primary : colors.textMuted} />
      </View>
      <ActionButton label={t('settings.deleteAccount')} variant="danger" disabled={Boolean(operation)} loading={operation === 'delete'} onPress={handleDeleteAccount} style={{ marginTop: 24 }} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: 16 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, marginBottom: 12 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12 },
  settingText: { flex: 1 },
  settingTitle: { ...typography.bodyBold, color: colors.textPrimary },
  settingSubtitle: { ...typography.small, lineHeight: 20, color: colors.textSecondary, marginTop: 4 },
});
