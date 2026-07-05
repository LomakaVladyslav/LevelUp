import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '../../services/auth.service';
import { useAuthStore } from '../../stores/auth.store';
import { useSettingsStore } from '../../stores/settings.store';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { UserAvatar } from '../../components/UserAvatar';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';

export default function SettingsScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, setUser, logout } = useAuthStore();
  const {
    themeMode,
    setThemeMode,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useSettingsStore();
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [savingAge, setSavingAge] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);

  useEffect(() => {
    setAge(user?.age ? String(user.age) : '');
  }, [user?.age]);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('image.permissionTitle'), t('image.permissionMessage'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingAvatar(true);
    try {
      const updated = await authService.updateAvatar(result.assets[0].uri);
      await setUser(updated);
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        getApiErrorMessage(error, t, 'common.somethingWrong'),
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveAge = async () => {
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      Alert.alert(t('common.error'), t('register.ageInvalid'));
      return;
    }

    setSavingAge(true);
    try {
      const updated = await authService.updateMe({ age: parsedAge });
      await setUser(updated);
      Alert.alert(t('settings.saved'));
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        getApiErrorMessage(error, t, 'common.somethingWrong'),
      );
    } finally {
      setSavingAge(false);
    }
  };

  const handleNotificationsChange = async (enabled: boolean) => {
    setUpdatingNotifications(true);
    try {
      await setNotificationsEnabled(enabled);
    } catch (error: any) {
      const message =
        error.message === 'notifications.permissionDenied'
          ? t('notifications.permissionDenied')
          : error.message || t('common.error');
      Alert.alert(t('common.error'), message);
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const handleThemeChange = (enabled: boolean) => {
    void setThemeMode(enabled ? 'dark' : 'light');
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await authService.deleteMe();
            await setNotificationsEnabled(false);
            await logout();
          } catch (error: any) {
            Alert.alert(
              t('common.error'),
              getApiErrorMessage(error, t, 'settings.deleteFailed'),
            );
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>

      <View style={styles.avatarRow}>
        <UserAvatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size={72}
        />
        <View style={styles.avatarTextWrap}>
          <Text style={styles.label}>{t('settings.avatar')}</Text>
          <TouchableOpacity
            style={[styles.secondaryButton, uploadingAvatar && styles.disabled]}
            onPress={pickAvatar}
            disabled={uploadingAvatar}
          >
            <Text style={styles.secondaryButtonText}>
              {uploadingAvatar ? t('common.saving') : t('register.changeAvatar')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.label}>{t('settings.age')}</Text>
      <View style={styles.inlineRow}>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder={t('register.agePlaceholder')}
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          style={[styles.saveButton, savingAge && styles.disabled]}
          onPress={saveAge}
          disabled={savingAge}
        >
          <Text style={styles.saveButtonText}>
            {savingAge ? t('common.saving') : t('common.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{t('settings.notifications')}</Text>
          <Text style={styles.settingSubtitle}>{t('settings.notificationsTime')}</Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={handleNotificationsChange}
          disabled={updatingNotifications}
          trackColor={{ false: colors.border, true: colors.primaryLight }}
          thumbColor={notificationsEnabled ? colors.primary : colors.textMuted}
        />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{t('settings.darkTheme')}</Text>
          <Text style={styles.settingSubtitle}>{t('settings.darkThemeSubtitle')}</Text>
        </View>
        <Switch
          value={themeMode === 'dark'}
          onValueChange={handleThemeChange}
          trackColor={{ false: colors.border, true: colors.primaryLight }}
          thumbColor={themeMode === 'dark' ? colors.primary : colors.textMuted}
        />
      </View>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Text style={styles.deleteButtonText}>{t('settings.deleteAccount')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avatarTextWrap: { flex: 1 },
  label: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.xs },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: { ...typography.small, color: colors.textPrimary },
  inlineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    minWidth: 96,
    alignItems: 'center',
  },
  saveButtonText: { ...typography.bodyBold, color: colors.textOnPrimary },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  settingText: { flex: 1 },
  settingTitle: { ...typography.bodyBold, color: colors.textPrimary },
  settingSubtitle: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 28, color: colors.textMuted },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  deleteButtonText: { ...typography.bodyBold, color: colors.danger },
  disabled: { opacity: 0.6 },
  });
};
