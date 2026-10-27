import { pageContent } from '../../components/ScreenUi';
import { useScreenResource } from '../../hooks/useScreenResource';
import { ResourceError } from '../../components/ResourceError';
import { useMemo, useRef, useState } from 'react';
import { plannedActivityService } from '../../services/plannedActivity.service';
import { completePlannedActivity } from '../../services/complete-planned-activity';
import { apiContext } from '../../services/api-context';
import { orderTasks, isTaskAvailable } from '../../utils/task-order';
import { getApiErrorMessage } from '../../utils/api-error';
import { CompletionCelebration, CompletionCelebrationData } from '../../components/CompletionCelebration';
import {
  View,
  Alert,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { statsService } from '../../services/stats.service';
import { activityService } from '../../services/activity.service';
import { recommendationService } from '../../services/recommendation.service';
import { Activity, PlannedActivity } from '../../types';
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
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const { data: overview, error, loading, refreshing, reload: loadData } = useScreenResource(() => statsService.getOverview());
  const history = useScreenResource(() => activityService.getAll(1));
  const tasks = useScreenResource(() => plannedActivityService.getAll());
  // Optional advice must never hold up the task or progress controls.
  const recommendations = useScreenResource(() => recommendationService.getAll());
  const [completing, setCompleting] = useState(false);
  const completingRef = useRef(false);
  const [celebration, setCelebration] = useState<CompletionCelebrationData | null>(null);
  const recentActivities = history.data?.activities.slice(0, 5) ?? [];
  const pending = useMemo(() => orderTasks((tasks.data?.plannedActivities ?? []).filter((task) => task.status === 'ACTIVE' && !task.isCompletedToday)), [tasks.data]);
  const nextTask = pending[0];
  const available = nextTask && isTaskAvailable(nextTask);
  const firstTask = !tasks.loading && !tasks.error && !tasks.data?.plannedActivities.length && (overview?.totalActivities ?? user?.xp ?? 0) === 0;
  const reloadAll = () => { void loadData(); void history.reload(); void tasks.reload(); void recommendations.reload(); };

  const complete = async (activity: PlannedActivity) => {
    if (completingRef.current) return;
    completingRef.current = true;
    setCompleting(true);
    const session = apiContext.get().sessionVersion;
    try {
      const result = await completePlannedActivity(activity);
      if (session !== apiContext.get().sessionVersion) return;
      tasks.setData((current) => ({
        plannedActivities: (current?.plannedActivities ?? []).map((task) => task.id === activity.id ? {
          ...task, isCompletedToday: true, status: task.scheduleType === 'DAILY' ? 'ACTIVE' : 'COMPLETED',
        } : task),
        todayProgress: current?.todayProgress ?? { completed: 0, total: 0, percentage: 0 },
      }));
      setCelebration({ variant: result.levelUp ? 'levelUp' : result.newAchievements.length ? 'achievement' : 'completed', xpGained: result.xpGained + (result.achievementXpGained ?? 0), newLevel: result.newLevel });
      void tasks.reload();
      void loadData();
      void history.reload();
    } catch (failure: any) {
      if (session === apiContext.get().sessionVersion) {
        Alert.alert(t('common.error'), getApiErrorMessage(failure, t, 'activities.completeFailed'));
        if (failure.response?.status === 409) void tasks.reload();
      }
    } finally { completingRef.current = false; setCompleting(false); }
  };

  const xp = overview?.user.xpProgress;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || tasks.refreshing || history.refreshing}
            onRefresh={reloadAll}
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

        <ResourceError error={tasks.error || error || history.error} retry={reloadAll} />
        <View style={styles.taskCard}>
          <View style={styles.taskHeading}>
            <Text style={styles.sectionTitle}>{t('home.nextTask')}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.navigate('/(tabs)/activities')} style={styles.textButton}>
              <Text style={styles.linkText}>{t('home.allTasks')}</Text>
            </TouchableOpacity>
          </View>
          {tasks.loading ? <ActivityIndicator color={colors.primary} /> : nextTask ? <>
            <Text style={styles.activityTitle}>{activityEmoji[nextTask.type]} {nextTask.displayTitle || nextTask.title}</Text>
            {nextTask.description || nextTask.displayDescription ? <Text style={styles.taskDescription} numberOfLines={3}>{nextTask.displayDescription || nextTask.description}</Text> : null}
            <Text style={styles.taskDescription}>
              {t(nextTask.scheduleType === 'DAILY' ? 'activities.scheduleDaily' : nextTask.scheduleType === 'DATE' ? 'activities.scheduleDate' : 'activities.scheduleSimple')}
              {nextTask.dueDate ? ` · ${new Date(`${nextTask.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString(getLocale(language))}` : ''}
              {nextTask.dueTimeMinutes != null ? ` · ${String(Math.floor(nextTask.dueTimeMinutes / 60)).padStart(2, '0')}:${String(nextTask.dueTimeMinutes % 60).padStart(2, '0')}` : ''}
            </Text>
            {available ? <TouchableOpacity accessibilityRole="button" style={[styles.primaryButton, completing && { opacity: 0.6 }]} disabled={completing} onPress={() => { void complete(nextTask); }}>
              <Text style={styles.primaryButtonText}>{t(completing ? 'activities.completing' : 'activities.complete')}</Text>
            </TouchableOpacity> : <Text style={styles.taskDescription}>{t('home.nothingDue')}</Text>}
          </> : !tasks.error ? <Text style={styles.taskDescription}>{t(tasks.data?.plannedActivities.length ? 'home.nothingDue' : 'home.firstTask')}</Text> : null}
          <TouchableOpacity accessibilityRole="button" style={firstTask ? styles.primaryButton : styles.textButton} onPress={() => router.navigate({ pathname: '/(tabs)/activities', params: { create: '1' } })}>
            <Text style={firstTask ? styles.primaryButtonText : styles.linkText}>+ {t('activities.createTaskButton')}</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {overview ? <>
        {/* Level + XP Card */}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('tabs.stats')} accessibilityValue={{ text: `${t('home.level')} ${overview.user.level}. ${t('profile.totalXp')}: ${overview.user.totalXp}` }} style={styles.levelCard} onPress={() => router.navigate('/(tabs)/stats')}>
          <View style={styles.levelRow}>
            <Text style={styles.levelLabel}>⬆️ {t('home.level')}</Text>
            <Text style={styles.levelNumber}>{overview?.user.level}</Text>
          </View>
          <Text style={styles.totalXp}>{t('profile.totalXp')}: {overview?.user.totalXp ?? 0}</Text>
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
        </TouchableOpacity>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('home.dayStreak')} accessibilityValue={{ text: String(overview.streak.current) }} style={styles.statCard} onPress={() => Alert.alert(t('home.dayStreak'), t('home.streakHelp'))}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={styles.statValue}>{overview?.streak.current ?? 0}</Text>
            <Text style={styles.statLabel}>{t('home.dayStreak')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/activity-history')}
            activeOpacity={0.8}
          >
            <Text style={styles.statEmoji}>⚡</Text>
            <Text style={styles.statValue}>{overview?.totalActivities ?? 0}</Text>
            <Text style={styles.statLabel}>{t('home.activities')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/achievements')}
            activeOpacity={0.8}
          >
            <Text style={styles.statEmoji}>🏆</Text>
            <Text style={styles.statValue}>{overview?.unlockedAchievements ?? 0}</Text>
            <Text style={styles.statLabel}>{t('home.badges')}</Text>
          </TouchableOpacity>
        </View>



        </> : null}
        {/* Recent Activities */}
        <Text style={styles.sectionTitle}>{t('home.recentActivity')}</Text>
        {history.loading ? <ActivityIndicator color={colors.primary} /> : history.error && !history.data ? null : recentActivities.length === 0 ? (
          <Text style={styles.emptyText}>
            {t('home.noActivities')}
          </Text>
        ) : (
          recentActivities.map((activity) => (
            <TouchableOpacity
              accessibilityRole="button"
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
        <RecommendationCard recommendations={recommendations.data ?? []} />
      </ScrollView>
      <CompletionCelebration visible={Boolean(celebration)} data={celebration} onDismiss={() => setCelebration(null)} />
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
  content: { ...pageContent },
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
  taskCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  taskHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  taskDescription: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  textButton: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.bodyBold, color: colors.primary },
  primaryButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  primaryButtonText: { ...typography.bodyBold, color: colors.textOnPrimary },
  levelCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  levelLabel: { ...typography.body, color: colors.levelTextMuted },
  levelNumber: { ...typography.h2, color: colors.textOnPrimary },
  totalXp: { ...typography.bodyBold, color: colors.textOnPrimary, marginBottom: spacing.sm },
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
  activityXp: { ...typography.bodyBold, color: colors.xpText },
  });
};
