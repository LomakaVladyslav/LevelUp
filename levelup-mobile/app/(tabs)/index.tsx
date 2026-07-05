import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { statsService } from '../../services/stats.service';
import { activityService } from '../../services/activity.service';
import { recommendationService } from '../../services/recommendation.service';
import { StatsOverview, Activity, Recommendation } from '../../types';
import {
  activityEmoji,
  AppTheme,
  spacing,
  borderRadius,
  typography,
} from '../../constants/theme';
import { useAuthStore } from '../../stores/auth.store';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settings.store';
import { getLocale } from '../../constants/i18n';
import { UserAvatar } from '../../components/UserAvatar';
import { RecommendationCard } from '../../components/RecommendationCard';
import { ActivityDetailsModal } from '../../components/ActivityDetailsModal';

export default function HomeScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const recommendationRequest = recommendationService
        .getAll()
        .catch((error) => {
          console.error(error);
          return [];
        });
      const [overviewData, activitiesData, recommendationData] = await Promise.all([
        statsService.getOverview(),
        activityService.getAll(1),
        recommendationRequest,
      ]);
      setOverview(overviewData);
      setRecentActivities(activitiesData.activities.slice(0, 5));
      setRecommendations(recommendationData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const xp = overview?.user.xpProgress;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData();
            }}
          />
        }
      >
        <View style={styles.greetingRow}>
          <UserAvatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size={48}
          />
          <Text style={styles.greeting}>
            {t('home.greeting', { username: user?.username ?? '' })}
          </Text>
        </View>

        {/* Level + XP Card */}
        <View style={styles.levelCard}>
          <View style={styles.levelRow}>
            <Text style={styles.levelLabel}>⬆️ {t('home.level')}</Text>
            <Text style={styles.levelNumber}>{overview?.user.level}</Text>
          </View>
          <View style={styles.xpTrack}>
            <View
              style={[
                styles.xpFill,
                { width: `${xp?.percentage ?? 0}%` as any },
              ]}
            />
          </View>
          <Text style={styles.xpText}>
            {t('home.xpToNext', {
              current: xp?.current ?? 0,
              required: xp?.required ?? 0,
            })}
          </Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={styles.statValue}>{overview?.streak.current ?? 0}</Text>
            <Text style={styles.statLabel}>{t('home.dayStreak')}</Text>
          </View>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/activity-history')}
            activeOpacity={0.8}
          >
            <Text style={styles.statEmoji}>⚡</Text>
            <Text style={styles.statValue}>{overview?.totalActivities ?? 0}</Text>
            <Text style={styles.statLabel}>{t('home.activities')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/achievements')}
            activeOpacity={0.8}
          >
            <Text style={styles.statEmoji}>🏆</Text>
            <Text style={styles.statValue}>{overview?.unlockedAchievements ?? 0}</Text>
            <Text style={styles.statLabel}>{t('home.badges')}</Text>
          </TouchableOpacity>
        </View>

        <RecommendationCard recommendations={recommendations} />

        {/* Recent Activities */}
        <Text style={styles.sectionTitle}>{t('home.recentActivity')}</Text>
        {recentActivities.length === 0 ? (
          <Text style={styles.emptyText}>
            {t('home.noActivities')}
          </Text>
        ) : (
          recentActivities.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              style={styles.activityRow}
              onPress={() => setSelectedActivity(activity)}
              activeOpacity={0.75}
            >
              <Text style={styles.activityEmoji}>{activityEmoji[activity.type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle}>
                  {activity.displayTitle || activity.title}
                </Text>
                <Text style={styles.activityDate}>
                  {new Date(activity.completedAt).toLocaleDateString(getLocale(language))}
                </Text>
              </View>
              <Text style={styles.activityXp}>+{activity.xpEarned} XP</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      <ActivityDetailsModal
        activity={selectedActivity}
        visible={Boolean(selectedActivity)}
        onClose={() => setSelectedActivity(null)}
      />
    </>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  greeting: { ...typography.h2, color: colors.textPrimary, flex: 1 },
  levelCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  levelLabel: { ...typography.body, color: colors.levelTextMuted },
  levelNumber: { ...typography.h2, color: colors.textOnPrimary },
  xpTrack: {
    height: 8,
    backgroundColor: colors.levelTrack,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  xpFill: {
    height: '100%',
    backgroundColor: colors.xpGold,
    borderRadius: borderRadius.full,
  },
  xpText: { ...typography.tiny, color: colors.levelTextMuted },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statEmoji: { fontSize: 24, marginBottom: spacing.xs },
  statValue: { ...typography.h3, color: colors.textPrimary },
  statLabel: { ...typography.tiny, color: colors.textSecondary },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  activityEmoji: { fontSize: 24 },
  activityTitle: { ...typography.bodyBold, color: colors.textPrimary },
  activityDate: { ...typography.tiny, color: colors.textSecondary },
  activityXp: { ...typography.bodyBold, color: colors.xpGold },
  });
};
