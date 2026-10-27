import { ActionButton, pageContent } from '../../components/ScreenUi';
import { useScreenResource } from '../../hooks/useScreenResource';
import { ResourceError } from '../../components/ResourceError';
import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/auth.store';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { UserAvatar } from '../../components/UserAvatar';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';

export default function ProfileScreen() {
  const t = useT();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { error, refreshing, reload } = useScreenResource(() => useAuthStore.getState().refreshUser());

  const handleLogout = () => {
    Alert.alert(t('profile.logOut'), t('profile.logOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logOut'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void reload(); }} />} >
      <ResourceError error={error} retry={() => { void reload(); }} />
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

      <View style={styles.actions}>
        <ActionButton label={t('tabs.stats')} onPress={() => router.navigate('/(tabs)/stats')} />
        <ActionButton label={t('profile.settings')} variant="secondary" onPress={() => router.navigate('/(tabs)/settings')} />
        <ActionButton label={t('tabs.ai')} variant="secondary" onPress={() => router.navigate('/(tabs)/ai')} />
        <ActionButton label={t('profile.logOut')} variant="danger" onPress={handleLogout} />
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { ...pageContent, paddingTop: spacing.xl, alignItems: 'center' },
  actions: { width: '100%', gap: spacing.sm },
  username: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs, marginTop: spacing.md, textAlign: 'center' },
  email: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl, textAlign: 'center' },
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
};
