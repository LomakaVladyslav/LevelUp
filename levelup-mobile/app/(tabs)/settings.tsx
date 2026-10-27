import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const pending = useRef(false);
  const [operation, setOperation] = useState<'age' | 'avatar' | 'delete' | null>(null);
  const [saved, setSaved] = useState(false);
  const notificationsPending = useRef(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setAge(user?.age ? String(user.age) : ''); }, [user?.age]);

  // Both the confirmation and async result belong to the initiating session.
  const runProfileChange = async (kind: 'age' | 'avatar' | 'delete', change: (isCurrent: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    const session = apiContext.get().sessionVersion;
    const isCurrent = () => mounted.current && session === apiContext.get().sessionVersion;
    pending.current = true;
    setOperation(kind);
    setSaved(false);
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
  const saveAge = () => {
    const parsedAge = age.trim() ? Number(age) : null;
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120)) {
      Alert.alert(t('common.error'), t('register.ageInvalid')); return;
    }
    Keyboard.dismiss();
    void runProfileChange('age', async (isCurrent) => {
      const updated = await authService.updateMe({ age: parsedAge });
      if (!isCurrent()) return;
      await setUser(updated);
      if (isCurrent()) setSaved(true);
    });
  };
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
        <Text style={styles.label}>{t('settings.age')}</Text>
        <View style={styles.inlineRow}>
          <TextInput style={styles.input} value={age} onChangeText={(value) => { setAge(value); setSaved(false); }} keyboardType="number-pad" maxLength={3}
            editable={!operation} accessibilityLabel={t('settings.age')} placeholder={t('register.agePlaceholder')} placeholderTextColor={colors.textMuted} />
          <ActionButton label={t('common.save')} onPress={saveAge} loading={operation === 'age'} disabled={Boolean(operation) || age.trim() === (user?.age ? String(user.age) : '')} />
        </View>
        {saved ? <Text accessibilityLiveRegion="polite" style={{ color: colors.successText, marginTop: 8 }}>{t('settings.saved')}</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.settingTitle}>{t('common.language')}</Text>
        <LanguageSelector inline />
      </View>
      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{t('settings.notifications')}</Text>
          <Text style={styles.settingSubtitle}>{t('settings.notificationsTime')}</Text>
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
  label: { ...typography.small, color: colors.textSecondary, marginBottom: 8 },
  inlineRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, ...typography.body, color: colors.textPrimary },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12 },
  settingText: { flex: 1 },
  settingTitle: { ...typography.bodyBold, color: colors.textPrimary },
  settingSubtitle: { ...typography.small, lineHeight: 20, color: colors.textSecondary, marginTop: 4 },
});
