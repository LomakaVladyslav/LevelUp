import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useScreenResource } from '../hooks/useScreenResource';
import { useTheme } from '../hooks/useTheme';
import { useT } from '../hooks/useT';
import { activityService } from '../services/activity.service';
import { dateKeyInZone } from '../services/reminder-time';
import { getDeviceTimezone } from '../services/api-context';
import { ActionButton } from './ScreenUi';
import { ResourceError } from './ResourceError';
import { CacheNotice } from './CacheNotice';
import { UndoCompletionButton } from './UndoCompletionButton';

// Mounted only when expanded; today's primary list needs one request, not a dashboard cascade.
export function TodayCompleted() {
  const t = useT(); const { colors } = useTheme(); const router = useRouter();
  const { data, setData, error, loading, reload, getVersion, cached, savedAt } = useScreenResource(() => activityService.getAll(1), 'history');
  const [pagingError, setPagingError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const zone = getDeviceTimezone(); const today = dateKeyInZone(new Date(), zone);
  const completed = useMemo(() => (data?.activities ?? []).filter(item => dateKeyInZone(new Date(item.completedAt), zone) === today), [data, today, zone]);
  const last = data?.activities.at(-1);
  const more = data && data.pagination.page < data.pagination.totalPages && (!last || dateKeyInZone(new Date(last.completedAt), zone) >= today);
  const loadMore = async () => {
    if (!more || pending.current) return;
    pending.current = true; setBusy(true); setPagingError(null);
    const version = getVersion();
    try {
      const next = await activityService.getAll(data.pagination.page + 1);
      if (version === getVersion()) setData({ ...next, activities: [...new Map([...data.activities, ...next.activities].map(item => [item.id, item])).values()] });
    } catch (failure) { if (version === getVersion()) setPagingError(failure); }
    finally { pending.current = false; setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <CacheNotice cached={cached} savedAt={savedAt} error={error} />
    <ResourceError error={error} retry={() => { void reload(); }} />
    {loading ? <ActivityIndicator color={colors.primary} /> : null}
    {!loading && !error && !completed.length ? <Text style={{ color: colors.textSecondary }}>{t('daily.noCompleted')}</Text> : null}
    {completed.map(item => <View key={item.id} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 12, gap: 8 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 16 }}>{item.displayTitle || item.title}</Text>
      <UndoCompletionButton activityId={item.id} onDone={() => { void reload(); }} />
    </View>)}
    <ResourceError error={pagingError} retry={() => { void loadMore(); }} />
    {more ? <ActionButton variant="secondary" label={t('daily.loadMore')} loading={busy} onPress={() => { void loadMore(); }} /> : null}
    <ActionButton variant="secondary" label={t('daily.history')} onPress={() => router.navigate('/(tabs)/activity-history')} />
  </View>;
}
