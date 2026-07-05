import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { activityService } from '../../services/activity.service';
import { Activity, ActivityType } from '../../types';
import {
  activityEmoji,
  AppTheme,
  borderRadius,
  spacing,
  typography,
} from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settings.store';
import { getLocale } from '../../constants/i18n';
import { ActivityDetailsModal } from '../../components/ActivityDetailsModal';

export default function ActivityHistoryScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors, activityColor } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const activityLabel = (type: ActivityType) => {
    switch (type) {
      case 'STUDY':
        return t('activity.study');
      case 'WORKOUT':
        return t('activity.workout');
      case 'HABIT':
        return t('activity.habit');
      case 'CUSTOM':
        return t('activity.custom');
    }
  };

  const loadActivities = useCallback(async (nextPage = 1, append = false) => {
    try {
      const data = await activityService.getAll(nextPage);
      setActivities((current) => append
        ? [...current, ...data.activities]
        : data.activities);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      void loadActivities(1);
    }, [loadActivities])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
              void loadActivities(1);
            }}
          />
        }
      >
        {activities.length === 0 ? (
          <Text style={styles.emptyText}>{t('home.noActivities')}</Text>
        ) : (
          activities.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              style={styles.row}
              onPress={() => setSelectedActivity(activity)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.typeDot,
                  { backgroundColor: activityColor[activity.type] },
                ]}
              />
              <Text style={styles.activityEmoji}>{activityEmoji[activity.type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {activity.displayTitle || activity.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {activityLabel(activity.type)} •{' '}
                  {new Date(activity.completedAt).toLocaleString(getLocale(language))}
                </Text>
              </View>
              <Text style={styles.rowXp}>+{activity.xpEarned}</Text>
            </TouchableOpacity>
          ))
        )}

        {page < totalPages ? (
          <TouchableOpacity
            style={[styles.loadMoreButton, loadingMore && { opacity: 0.6 }]}
            disabled={loadingMore}
            onPress={() => {
              setLoadingMore(true);
              void loadActivities(page + 1, true);
            }}
          >
            {loadingMore ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.loadMoreText}>{t('activities.loadMore')}</Text>
            )}
          </TouchableOpacity>
        ) : null}
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
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  activityEmoji: { fontSize: 22 },
  rowTitle: { ...typography.bodyBold, color: colors.textPrimary },
  rowMeta: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  rowXp: { ...typography.bodyBold, color: colors.xpGold },
  loadMoreButton: {
    minHeight: 46,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  loadMoreText: { ...typography.bodyBold, color: colors.textOnPrimary },
  });
};
