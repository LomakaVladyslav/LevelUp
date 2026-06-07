import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../services/api';
import { Achievement } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useSettingsStore } from '../../stores/settings.store';

export default function AchievementsScreen() {
  const t = useT();
  const language = useSettingsStore((state) => state.language);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAchievements = useCallback(async () => {
    try {
      const { data } = await api.get('/achievements');
      setAchievements(data.achievements);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      void loadAchievements();
    }, [loadAchievements])
  );

  const unlocked = achievements.filter((a) => a.isUnlocked);
  const locked = achievements.filter((a) => !a.isUnlocked);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadAchievements();
          }}
        />
      }
    >
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          🏆 {t('achievements.summary', {
            unlocked: unlocked.length,
            total: achievements.length,
          })}
        </Text>
      </View>

      {unlocked.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('achievements.unlocked')}</Text>
          <View style={styles.grid}>
            {unlocked.map((a) => (
              <View key={a.id} style={[styles.card, styles.cardUnlocked]}>
                <Text style={styles.emoji}>{a.iconEmoji}</Text>
                <Text style={styles.name}>{a.name}</Text>
                <Text style={styles.desc}>{a.description}</Text>
                {a.xpReward > 0 && (
                  <Text style={styles.reward}>+{a.xpReward} XP</Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {locked.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('achievements.locked')}</Text>
          <View style={styles.grid}>
            {locked.map((a) => (
              <View key={a.id} style={[styles.card, styles.cardLocked]}>
                <Text style={[styles.emoji, styles.lockedEmoji]}>🔒</Text>
                <Text style={[styles.name, styles.lockedText]}>{a.name}</Text>
                <Text style={[styles.desc, styles.lockedText]}>{a.description}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summary: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  summaryText: { ...typography.bodyBold, color: '#fff' },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  card: {
    width: '47%',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  cardUnlocked: { backgroundColor: colors.surface },
  cardLocked: { backgroundColor: colors.surfaceSecondary },
  emoji: { fontSize: 32, marginBottom: spacing.xs },
  lockedEmoji: { opacity: 0.4 },
  name: { ...typography.bodyBold, color: colors.textPrimary, textAlign: 'center' },
  desc: { ...typography.tiny, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  lockedText: { color: colors.textMuted },
  reward: { ...typography.tiny, color: colors.xpGold, marginTop: spacing.xs },
});
