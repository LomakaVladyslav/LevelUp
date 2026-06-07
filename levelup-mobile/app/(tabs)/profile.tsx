import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/auth.store';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import { UserAvatar } from '../../components/UserAvatar';
import { useT } from '../../hooks/useT';
import { useSettingsStore } from '../../stores/settings.store';

export default function ProfileScreen() {
  const t = useT();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { language, toggleLanguage } = useSettingsStore();

  const handleLogout = () => {
    Alert.alert(t('profile.logOut'), t('profile.logOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logOut'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <UserAvatar
        username={user?.username}
        avatarUrl={user?.avatarUrl}
        size={96}
      />

      <Text style={styles.username}>{user?.username}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{t('home.level')} {user?.level}</Text>
          <Text style={styles.statLabel}>{t('profile.currentLevel')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{user?.xp}</Text>
          <Text style={styles.statLabel}>{t('profile.totalXp')}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => router.push('/(tabs)/settings')}
      >
        <Text style={styles.actionText}>{t('profile.settings')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionButton} onPress={toggleLanguage}>
        <Text style={styles.actionText}>
          {t('common.language')}: {language === 'en' ? t('common.english') : t('common.ukrainian')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('profile.logOut')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, alignItems: 'center' },
  username: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs, marginTop: spacing.md },
  email: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, width: '100%' },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { ...typography.h3, color: colors.primary },
  statLabel: { ...typography.tiny, color: colors.textSecondary },
  actionButton: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionText: { ...typography.bodyBold, color: colors.textPrimary },
  logoutButton: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  logoutText: { ...typography.bodyBold, color: colors.danger },
});
