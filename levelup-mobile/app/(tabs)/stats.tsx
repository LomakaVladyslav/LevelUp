import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { statsService } from '../../services/stats.service';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settings.store';
import { getLocale } from '../../constants/i18n';

export default function StatsScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const [weeklyData, setWeeklyData] = useState<
    { date: string; count: number; xpEarned: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadWeeklyData = useCallback(async () => {
    try {
      const data = await statsService.getWeekly();
      setWeeklyData(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWeeklyData();
    }, [loadWeeklyData])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const maxCount = Math.max(...weeklyData.map((d) => d.count), 1);
  const totalThisWeek = weeklyData.reduce((sum, d) => sum + d.count, 0);
  const totalXp = weeklyData.reduce((sum, d) => sum + d.xpEarned, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadWeeklyData();
          }}
        />
      }
    >
      {/* Summary Cards */}
      <View style={styles.row}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalThisWeek}</Text>
          <Text style={styles.summaryLabel}>{t('stats.activitiesThisWeek')}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: colors.xpGold }]}>
            {totalXp}
          </Text>
          <Text style={styles.summaryLabel}>{t('stats.xpThisWeek')}</Text>
        </View>
      </View>

      {/* Simple bar chart — no library needed */}
      <Text style={styles.chartTitle}>{t('stats.last7Days')}</Text>
      <View style={styles.chartContainer}>
        {weeklyData.map((day) => {
          const barHeight = maxCount > 0 ? (day.count / maxCount) * 120 : 0;
          const dayLabel = new Date(day.date).toLocaleDateString(getLocale(language), { weekday: 'short' });
          return (
            <View key={day.date} style={styles.barWrapper}>
              <Text style={styles.barCount}>{day.count > 0 ? day.count : ''}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[styles.bar, { height: Math.max(barHeight, day.count > 0 ? 4 : 0) }]}
                />
              </View>
              <Text style={styles.barLabel}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>

      {/* XP per day */}
      <Text style={styles.chartTitle}>{t('stats.xpPerDay')}</Text>
      {weeklyData.map((day) => {
        const maxXp = Math.max(...weeklyData.map((d) => d.xpEarned), 1);
        const pct = (day.xpEarned / maxXp) * 100;
        return (
          <View key={day.date} style={styles.xpRow}>
            <Text style={styles.xpDay}>
              {new Date(day.date).toLocaleDateString(getLocale(language), { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <View style={styles.xpTrack}>
              <View style={[styles.xpBar, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.xpValue}>{day.xpEarned}</Text>
          </View>
        );
      })}
    </ScrollView>
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
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryValue: { ...typography.h2, color: colors.primary },
  summaryLabel: { ...typography.tiny, color: colors.textSecondary, textAlign: 'center' },
  chartTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 8,
    height: 180,
  },
  barWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 150 },
  barTrack: { width: '100%', height: 120, justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  barCount: { ...typography.tiny, color: colors.textSecondary, marginBottom: 4 },
  barLabel: { ...typography.tiny, color: colors.textSecondary, marginTop: 4 },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  xpDay: { ...typography.tiny, color: colors.textSecondary, width: 80 },
  xpTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBar: { height: '100%', backgroundColor: colors.xpGold, borderRadius: 4 },
  xpValue: { ...typography.tiny, color: colors.xpGold, width: 30, textAlign: 'right' },
  });
};
