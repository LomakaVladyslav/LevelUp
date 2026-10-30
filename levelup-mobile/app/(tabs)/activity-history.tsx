import { CacheNotice } from '../../components/CacheNotice';
import { useRouter } from 'expo-router';
import { ActionButton, EmptyState, pageContent } from '../../components/ScreenUi';
import { useScreenResource } from '../../hooks/useScreenResource';
import { ResourceError } from '../../components/ResourceError';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const { data, error, loading, refreshing, reload, setData, getVersion, cached, savedAt } = useScreenResource(() => activityService.getAll(1), 'history');
  const activities = data?.activities ?? [];
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<unknown>(null);
  const paging = useRef(false);
  const loadMore = async () => {
    if (paging.current || refreshing || !data || data.pagination.page >= data.pagination.totalPages) return;
    paging.current = true;
    setLoadingMore(true);
    setPageError(null);
    const version = getVersion();
    try {
      const next = await activityService.getAll(data.pagination.page + 1);
      if (version !== getVersion()) return;
      setData({ ...next, activities: [...new Map([...data.activities, ...next.activities].map((activity) => [activity.id, activity])).values()] });
    } catch (failure) { if (version === getVersion()) setPageError(failure); }
    finally { paging.current = false; setLoadingMore(false); }
  };

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={activities}
        keyExtractor={(activity) => activity.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setPageError(null); void reload(); }} />}
        ListHeaderComponent={<><CacheNotice cached={cached} savedAt={savedAt} error={error} /><ResourceError error={error} retry={() => { void reload(); }} /></>}
        ListEmptyComponent={!error ? <EmptyState title={t('activities.historyEmpty')} message={t('home.noActivities')} action={{ label: t('home.allTasks'), onPress: () => router.navigate('/(tabs)/activities') }} /> : null}
        renderItem={({ item: activity }) => (
            <TouchableOpacity
              accessibilityRole="button"
              key={activity.id}
              style={styles.row}
              onPress={() => setSelectedActivity(activity)}
              activeOpacity={0.75}
            >
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
              <Text style={styles.rowXp}>+{activity.xpEarned} XP</Text>
            </TouchableOpacity>
        )}
        ListFooterComponent={<>
          <ResourceError error={pageError} retry={() => { void loadMore(); }} />
          {data && data.pagination.page < data.pagination.totalPages ? (
            <ActionButton label={t('activities.loadMore')} loading={loadingMore} disabled={refreshing} onPress={() => { void loadMore(); }} />
          ) : null}
        </>}
      />
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
  rowXp: { ...typography.bodyBold, color: colors.xpText },
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
