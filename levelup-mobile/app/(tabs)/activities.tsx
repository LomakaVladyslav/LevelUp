import { EmptyState, pageContent } from '../../components/ScreenUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completePlannedActivity } from '../../services/complete-planned-activity';
import { orderTasks } from '../../utils/task-order';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { userData } from '../../services/user-data';
import { useScreenResource } from '../../hooks/useScreenResource';
import { ResourceError } from '../../components/ResourceError';
import { apiContext } from '../../services/api-context';
import { getApiErrorMessage } from '../../utils/api-error';
import type { ComponentRef } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Pressable,
  useWindowDimensions,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { plannedActivityService } from '../../services/plannedActivity.service';
import { notificationService } from '../../services/notification.service';
import {
  ActivityType,
  PlannedActivity,
  PlannedActivityInput,
  PlannedActivityScheduleType,
  TodayProgress,
} from '../../types';
import {
  AppTheme,
  spacing,
  borderRadius,
  typography,
  activityEmoji,
} from '../../constants/theme';
import { useAuthStore } from '../../stores/auth.store';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settings.store';
import { getLocale, getPluralKey } from '../../constants/i18n';
import {
  CompletionCelebration,
  CompletionCelebrationData,
} from '../../components/CompletionCelebration';

type PickerMode = 'date' | 'time' | null;
type MenuPosition = { top: number; left: number };

const EMPTY_TODAY_PROGRESS: TodayProgress = {
  completed: 0,
  total: 0,
  percentage: 0,
};

function ProgressRing({
  percentage,
  colors,
  styles,
}: {
  percentage: number;
  colors: AppTheme['colors'];
  styles: ActivityScreenStyles;
}) {
  const size = 64;
  const segmentCount = 20;
  const segmentRadius = 27;
  const progress = Math.round(Math.max(0, Math.min(100, percentage)));
  const activeSegments = Math.round((progress / 100) * segmentCount);

  return (
    <View style={styles.progressRing}>
      <View style={styles.progressRingSegments}>
        {Array.from({ length: segmentCount }, (_, index) => {
          const angle = (index / segmentCount) * Math.PI * 2 - Math.PI / 2;

          return (
            <View
              key={index}
              style={[
                styles.progressRingSegment,
                {
                  backgroundColor:
                    index < activeSegments ? colors.primary : colors.primaryLight,
                  left: size / 2 + Math.cos(angle) * segmentRadius - 2,
                  top: size / 2 + Math.sin(angle) * segmentRadius - 4,
                  transform: [{ rotate: `${(angle * 180) / Math.PI + 90}deg` }],
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.progressRingText}>{progress}%</Text>
    </View>
  );
}

const getDeviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const parseStoredDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const dateToDateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const minutesToDate = (minutes?: number | null) => {
  if (minutes == null) return null;
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const dateToMinutes = (date: Date | null) =>
  date ? date.getHours() * 60 + date.getMinutes() : null;

export default function ActivitiesScreen() {
  const t = useT();
  const router = useRouter();
  const { create } = useLocalSearchParams<{ create?: string }>();
  const consumedCreate = useRef(false);
  const theme = useTheme();
  const { colors, activityColor } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { data, setData, error, loading, refreshing, reload: loadActivities } = useScreenResource(() => plannedActivityService.getAll(true));
  const [showPaused, setShowPaused] = useState(false);
  const plannedActivities = useMemo(() => orderTasks((data?.plannedActivities ?? []).filter((activity) => activity.status === (showPaused ? 'DISABLED' : 'ACTIVE'))), [data, showPaused]);
  const todayProgress = data?.todayProgress ?? EMPTY_TODAY_PROGRESS;
  const submittingRef = useRef(false);
  const mutationRef = useRef(false);
  const userId = useAuthStore((state) => state.user?.id);
  const formOwner = useRef(userId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<PlannedActivity | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType>('STUDY');
  const [scheduleType, setScheduleType] = useState<PlannedActivityScheduleType>('SIMPLE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionCelebration, setCompletionCelebration] =
    useState<CompletionCelebrationData | null>(null);
  const [menuActivity, setMenuActivity] = useState<PlannedActivity | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const pendingMenuAction = useRef<(() => void) | null>(null);
  useEffect(() => () => { pendingMenuAction.current = null; }, []);
  const menuButtonRefs = useRef<
    Record<string, ComponentRef<typeof View> | null>
  >({});

  const activityTypes: { type: ActivityType; label: string }[] = [
    { type: 'STUDY', label: `${activityEmoji.STUDY} ${t('activity.study')}` },
    { type: 'WORKOUT', label: `${activityEmoji.WORKOUT} ${t('activity.workout')}` },
    { type: 'HABIT', label: `${activityEmoji.HABIT} ${t('activity.habit')}` },
    { type: 'CUSTOM', label: `${activityEmoji.CUSTOM} ${t('activity.custom')}` },
  ];

  const scheduleOptions: { type: PlannedActivityScheduleType; label: string }[] = [
    { type: 'SIMPLE', label: t('activities.scheduleSimple') },
    { type: 'DAILY', label: t('activities.scheduleDaily') },
    { type: 'DATE', label: t('activities.scheduleDate') },
  ];

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

  const scheduleLabel = (type: PlannedActivityScheduleType) => {
    switch (type) {
      case 'SIMPLE':
        return t('activities.scheduleSimple');
      case 'DAILY':
        return t('activities.scheduleDaily');
      case 'DATE':
        return t('activities.scheduleDate');
    }
  };

  const formatDate = (value?: string | null) => {
    const date = parseStoredDate(value);
    return date ? date.toLocaleDateString(getLocale(language)) : '';
  };

  const formatTime = (minutes?: number | null) => {
    const date = minutesToDate(minutes);
    return date
      ? date.toLocaleTimeString(getLocale(language), { hour: '2-digit', minute: '2-digit' })
      : '';
  };

  useEffect(() => {
    if (!modalVisible || editingActivity || !userId || submitting || formOwner.current !== userId) return;
    const draft = { title, description, selectedType, scheduleType, dueDate: dueDate?.toISOString(), dueTime: dueTime?.toISOString() };
    // Queue every draft snapshot immediately; closing or backgrounding cannot cancel the latest text.
    void userData.saveDraft(userId, JSON.stringify(draft)).catch(() => undefined);
  }, [modalVisible, editingActivity, userId, submitting, title, description, selectedType, scheduleType, dueDate, dueTime]);

  const resetForm = useCallback((activity?: PlannedActivity) => {
    setEditingActivity(activity ?? null);
    setSelectedType(activity?.type ?? 'STUDY');
    setScheduleType(activity?.scheduleType ?? 'SIMPLE');
    setTitle(activity?.title ?? '');
    setDescription(activity?.description ?? '');
    setDueDate(activity?.dueDate ? parseStoredDate(activity.dueDate) : null);
    setDueTime(minutesToDate(activity?.dueTimeMinutes));
    setPickerMode(null);
  }, []);

  useEffect(() => {
    if (formOwner.current === userId) return;
    formOwner.current = userId;
    resetForm();
    setModalVisible(false);
    setMenuActivity(null);
    setCompletionCelebration(null);
  }, [userId, resetForm]);

  const closeActionsMenu = () => {
    setMenuActivity(null);
    setMenuPosition(null);
  };

  const openCreateModal = useCallback(async () => {
    resetForm();
    const session = apiContext.get().sessionVersion;
    try {
      const value = userId ? await userData.readDraft(userId) : null;
      const draft = value ? JSON.parse(value) : null;
      if (session !== apiContext.get().sessionVersion) return;
      if (draft && typeof draft.title === 'string' && typeof draft.description === 'string') {
        setTitle(draft.title); setDescription(draft.description);
        if (['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'].includes(draft.selectedType)) setSelectedType(draft.selectedType);
        if (['SIMPLE', 'DAILY', 'DATE'].includes(draft.scheduleType)) setScheduleType(draft.scheduleType);
        if (draft.dueDate && Number.isFinite(Date.parse(draft.dueDate))) setDueDate(new Date(draft.dueDate));
        if (draft.dueTime && Number.isFinite(Date.parse(draft.dueTime))) setDueTime(new Date(draft.dueTime));
      }
    } catch { /* A corrupt draft must not block creating an activity. */ }
    if (session === apiContext.get().sessionVersion) setModalVisible(true);
  }, [userId, resetForm]);

  useEffect(() => {
    if (create !== '1') { consumedCreate.current = false; return; }
    if (consumedCreate.current) return;
    consumedCreate.current = true;
    router.setParams({ create: undefined });
    setShowPaused(false);
    void openCreateModal();
  }, [create, router, openCreateModal]);

  const finishMenuDismiss = () => {
    const action = pendingMenuAction.current;
    pendingMenuAction.current = null;
    action?.();
  };

  const runMenuAction = (action: () => void) => {
    const session = apiContext.get().sessionVersion;
    const guardedAction = () => { if (session === apiContext.get().sessionVersion) action(); };
    // iOS cannot safely present another sheet/alert while this modal is dismissing.
    if (Platform.OS === 'ios' && menuActivity && menuPosition) {
      pendingMenuAction.current = guardedAction;
      closeActionsMenu();
    } else {
      closeActionsMenu();
      guardedAction();
    }
  };

  const closeForm = () => {
    if (submittingRef.current) return;
    Keyboard.dismiss();
    setModalVisible(false);
  };

  const openEditModal = (activity: PlannedActivity) => {
    closeActionsMenu();
    resetForm(activity);
    setModalVisible(true);
  };

  const openActionsMenu = (activity: PlannedActivity) => {
    const menuButton = menuButtonRefs.current[activity.id];
    if (!menuButton) return;

    menuButton.measureInWindow((x, y, width, height) => {
      const menuWidth = 208;
      const menuHeight = activity.scheduleType === 'DAILY' ? 156 : 108;

      setMenuPosition({
        top: Math.max(
          spacing.md,
          Math.min(y + height + spacing.xs, windowHeight - menuHeight - spacing.md),
        ),
        left: Math.max(
          spacing.md,
          Math.min(x + width - menuWidth, windowWidth - menuWidth - spacing.md),
        ),
      });
      setMenuActivity(activity);
    });
  };

  const handleNotificationError = (error: unknown) => {
    if (error instanceof Error && error.message === 'notifications.permissionDenied') {
      Alert.alert(t('common.error'), t('notifications.permissionDenied'));
      return;
    }

    console.error(error);
  };

  const handleSave = async () => {
    if (submittingRef.current) return;
    if (!title.trim()) {
      Alert.alert(t('common.error'), t('activities.titleRequired'));
      return;
    }

    if (scheduleType === 'DATE' && !dueDate) {
      Alert.alert(t('common.error'), t('activities.dateRequired'));
      return;
    }

    const payload: PlannedActivityInput = {
      type: selectedType,
      title: title.trim(),
      description: description.trim() || null,
      scheduleType,
      dueDate: scheduleType === 'DATE' && dueDate ? dateToDateOnly(dueDate) : null,
      dueTimeMinutes: dateToMinutes(dueTime),
      timezone: getDeviceTimezone(),
    };

    Keyboard.dismiss();
    submittingRef.current = true;
    setSubmitting(true);
    const session = apiContext.get().sessionVersion;
    try {
      const result = editingActivity
        ? await plannedActivityService.update(editingActivity.id, { ...payload, timezone: editingActivity.timezone, updatedAt: editingActivity.updatedAt })
        : await plannedActivityService.create(payload);

      if (session !== apiContext.get().sessionVersion) return;
      setData((current) => ({
        plannedActivities: [result.plannedActivity, ...(current?.plannedActivities ?? []).filter((activity) => activity.id !== result.plannedActivity.id)],
        todayProgress: current?.todayProgress ?? EMPTY_TODAY_PROGRESS,
      }));
      setModalVisible(false);
      if (!editingActivity) {
        setShowPaused(false);
        if (userId) void userData.removeDraft(userId).catch(() => undefined);
      }
      resetForm();
      void loadActivities();
      void notificationService.rescheduleActivityReminder(result.plannedActivity, language).catch(handleNotificationError);
    } catch (e: any) {
      if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), getApiErrorMessage(e, t, 'activities.saveFailed'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleComplete = async (activity: PlannedActivity) => {
    if (mutationRef.current || (activity.scheduleType === 'DAILY' && activity.isCompletedToday)) return;
    mutationRef.current = true;
    setCompletingId(activity.id);
    const session = apiContext.get().sessionVersion;
    try {
      const result = await completePlannedActivity(activity);
      if (session !== apiContext.get().sessionVersion) return;
      setData((current) => ({
        plannedActivities: (current?.plannedActivities ?? []).map((item) => item.id !== activity.id ? item : {
          ...item, isCompletedToday: true, completedTodayAt: result.activity.completedAt,
          status: item.scheduleType === 'DAILY' ? 'ACTIVE' : 'COMPLETED',
        }),
        todayProgress: current?.todayProgress ?? EMPTY_TODAY_PROGRESS,
      }));
      setCompletionCelebration({ variant: result.levelUp ? 'levelUp' : result.newAchievements.length ? 'achievement' : 'completed', xpGained: result.xpGained + (result.achievementXpGained ?? 0), newLevel: result.newLevel });
      void loadActivities();
    } catch (e: any) {
      if (session === apiContext.get().sessionVersion) {
        Alert.alert(t('common.error'), getApiErrorMessage(e, t, 'activities.completeFailed'));
        if (e.response?.status === 409) void loadActivities();
      }
    } finally { mutationRef.current = false; setCompletingId(null); }
  };

  const removeVisibleActivity = (id: string, status?: PlannedActivity['status']) => {
    setData((current) => ({
      plannedActivities: status ? (current?.plannedActivities ?? []).map((item) => item.id === id ? { ...item, status } : item) : (current?.plannedActivities ?? []).filter((item) => item.id !== id),
      todayProgress: current?.todayProgress ?? EMPTY_TODAY_PROGRESS,
    }));
  };

  const handleResume = async (activity: PlannedActivity) => {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setCompletingId(activity.id);
    const session = apiContext.get().sessionVersion;
    try {
      const result = await plannedActivityService.update(activity.id, { status: 'ACTIVE', updatedAt: activity.updatedAt });
      if (session !== apiContext.get().sessionVersion) return;
      removeVisibleActivity(activity.id, 'ACTIVE');
      void loadActivities();
      void notificationService.rescheduleActivityReminder(result.plannedActivity, language).catch(handleNotificationError);
    } catch (failure) { if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), getApiErrorMessage(failure, t, 'common.somethingWrong')); }
    finally { mutationRef.current = false; setCompletingId(null); }
  };

  const handleDelete = (activity: PlannedActivity) => {
    if (mutationRef.current) return;
    closeActionsMenu();
    const session = apiContext.get().sessionVersion;
    Alert.alert(
      t('activities.deleteTitle'),
      t('activities.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (mutationRef.current || session !== apiContext.get().sessionVersion) return;
              mutationRef.current = true;
              try {
                await plannedActivityService.delete(activity.id);
                if (session !== apiContext.get().sessionVersion) return;
                removeVisibleActivity(activity.id);
                void loadActivities();
                void notificationService.cancelActivityReminder(activity.id).catch(handleNotificationError);
              } catch (e: any) {
                if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), getApiErrorMessage(e, t, 'activities.deleteFailed'));
              } finally { mutationRef.current = false; }
            })();
          },
        },
      ],
    );
  };

  const handleDisable = (activity: PlannedActivity) => {
    if (mutationRef.current) return;
    closeActionsMenu();
    const session = apiContext.get().sessionVersion;
    Alert.alert(
      t('activities.disableTitle'),
      t('activities.disableConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('activities.disable'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (mutationRef.current || session !== apiContext.get().sessionVersion) return;
              mutationRef.current = true;
              try {
                await plannedActivityService.update(activity.id, { status: 'DISABLED', updatedAt: activity.updatedAt });
                if (session !== apiContext.get().sessionVersion) return;
                removeVisibleActivity(activity.id);
                void loadActivities();
                void notificationService.cancelActivityReminder(activity.id).catch(handleNotificationError);
              } catch (e: any) {
                if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), getApiErrorMessage(e, t, 'activities.disableFailed'));
              } finally { mutationRef.current = false; }
            })();
          },
        },
      ],
    );
  };

  const activityMeta = (activity: PlannedActivity) => {
    const parts = [activityLabel(activity.type), scheduleLabel(activity.scheduleType)];

    if (activity.scheduleType === 'DATE' && activity.dueDate) {
      parts.push(formatDate(activity.dueDate));
    }

    if (activity.dueTimeMinutes != null) {
      parts.push(formatTime(activity.dueTimeMinutes));
    }

    return parts.join(' • ');
  };

  const streakLabel = (count: number) => {
    return t(
      getPluralKey(language, count, {
        one: 'activities.streakDayOne',
        few: 'activities.streakDayFew',
        many: 'activities.streakDayMany',
        other: 'activities.streakDayMany',
      }),
      { count },
    );
  };

  const activityMotivationText = (activity: PlannedActivity) =>
    activity.displayMotivationText?.trim() || activity.motivationText?.trim();

  return (
    <View style={styles.container}>
      <FlatList
        data={plannedActivities}
        keyExtractor={(activity) => activity.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadActivities();
            }}
          />
        }
        ListHeaderComponent={
          <>
            <ResourceError error={error} retry={() => { void loadActivities(); }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[false, true].map((paused) => <TouchableOpacity key={String(paused)} accessibilityRole="tab" accessibilityState={{ selected: showPaused === paused }} onPress={() => setShowPaused(paused)} style={{ minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: showPaused === paused ? colors.primaryLight : colors.surface }}>
                <Text style={{ color: colors.textPrimary }}>{t(paused ? 'activities.paused' : 'activities.active')}</Text>
              </TouchableOpacity>)}
              <TouchableOpacity accessibilityRole="button" onPress={() => router.navigate('/(tabs)/activity-history')} style={{ minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: colors.surface }}><Text style={{ color: colors.primary }}>{t('activities.history')} →</Text></TouchableOpacity>
            </View>
            {todayProgress.total > 0 && !showPaused ? <View style={styles.dailyProgressCard}>
              <ProgressRing
                percentage={todayProgress.percentage}
                colors={colors}
                styles={styles}
              />
              <View style={styles.dailyProgressContent}>
                <Text style={styles.dailyProgressLabel}>
                  {t('activities.todayProgress')}
                </Text>
                <Text style={styles.dailyProgressCount}>
                  {t('activities.todayProgressCount', {
                    completed: todayProgress.completed,
                    total: todayProgress.total,
                  })}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${todayProgress.percentage}%` as any },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.progressStar}>
                <Ionicons name="star" size={25} color={colors.textOnPrimary} />
              </View>
            </View> : null}

            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('activities.createTaskButton')}
              style={styles.logButton}
              onPress={openCreateModal}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color={colors.textOnPrimary} />
              <Text style={styles.logButtonText}>
                {t('activities.createTaskButton')}
              </Text>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          loading ? <ActivityIndicator size="large" color={colors.primary} /> : !error ? <EmptyState title={t(showPaused ? 'activities.pausedEmpty' : 'activities.active')} message={t(showPaused ? 'activities.pausedHelp' : 'activities.noPlannedActivities')} icon={showPaused ? 'pause-circle-outline' : 'checkbox-outline'} /> : null
        }
        renderItem={({ item: activity }) => {
          const completedToday = activity.status === 'ACTIVE' && activity.scheduleType === 'DAILY' && activity.isCompletedToday;
          const actionLabel = t(completingId === activity.id ? 'activities.completing' : completedToday ? 'activities.completed' : activity.status === 'DISABLED' ? 'activities.resume' : 'activities.complete');

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.activityIcon,
                    {
                      backgroundColor: `${activityColor[activity.type]}1A`,
                    },
                  ]}
                >
                  <Text allowFontScaling={false} style={styles.activityIconEmoji}>
                    {activityEmoji[activity.type]}
                  </Text>
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t('common.edit')}: ${activity.displayTitle || activity.title}`} onPress={() => openEditModal(activity)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{activity.displayTitle || activity.title}</Text>
                    </TouchableOpacity>
                    <View
                      ref={(ref) => {
                        menuButtonRefs.current[activity.id] = ref;
                      }}
                      collapsable={false}
                    >
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`${t('activities.actions')}: ${activity.displayTitle || activity.title}`}
                        style={styles.menuButton}
                        onPress={() => openActionsMenu(activity)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="ellipsis-vertical"
                          size={20}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.rowMeta}>{activityMeta(activity)}</Text>
                  {activity.scheduleType === 'DAILY' ? (
                    <Text style={styles.streakText}>
                      {streakLabel(activity.streakDays ?? 0)} 🔥
                    </Text>
                  ) : null}
                  {activity.displayDescription || activity.description ? (
                    <Text style={styles.description} numberOfLines={3}>
                      {activity.displayDescription || activity.description}
                    </Text>
                  ) : null}
                </View>
              </View>

              {activityMotivationText(activity) ? <View style={styles.motivationBadge}>
                <Ionicons name="star" size={13} color={colors.success} />
                <Text style={styles.motivationText}>
                  {activityMotivationText(activity)}
                </Text>
              </View> : null}

              <TouchableOpacity
                accessibilityLabel={`${actionLabel}: ${activity.displayTitle || activity.title}`}
                accessibilityRole="button" accessibilityState={{ disabled: completedToday || Boolean(completingId), busy: completingId === activity.id }}
                style={[
                  styles.completeButton,
                  completedToday && styles.completedButton,
                  completingId === activity.id && styles.disabledButton,
                ]}
                onPress={() => activity.status === 'DISABLED' ? handleResume(activity) : handleComplete(activity)}
                disabled={completedToday || Boolean(completingId)}
                activeOpacity={0.85}
              >
                {completedToday ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={19}
                    color={colors.success}
                  />
                ) : null}
                <Text
                  style={[
                    styles.completeButtonText,
                    completedToday && styles.completedButtonText,
                  ]}
                >
                  {actionLabel}
                  </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <Modal
        visible={Boolean(menuActivity && menuPosition)}
        transparent
        animationType="fade"
        onRequestClose={closeActionsMenu}
        onDismiss={finishMenuDismiss}
      >
        <View style={styles.menuModal}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeActionsMenu}
          />
          {menuActivity && menuPosition ? (
            <View
              style={[
                styles.contextMenu,
                {
                  top: menuPosition.top,
                  left: menuPosition.left,
                },
              ]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.contextMenuItem}
                accessibilityLabel={t('common.edit')}
                onPress={() => runMenuAction(() => openEditModal(menuActivity))}
              >
                <Ionicons
                  name="create-outline"
                  size={20}
                  color={colors.textPrimary}
                />
                <Text style={styles.contextMenuText}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.contextMenuItem}
                accessibilityLabel={t('common.delete')}
                onPress={() => runMenuAction(() => handleDelete(menuActivity))}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={colors.danger}
                />
                <Text style={[styles.contextMenuText, { color: colors.danger }]}>
                  {t('common.delete')}
                </Text>
              </TouchableOpacity>
              {menuActivity.scheduleType === 'DAILY' && menuActivity.status === 'ACTIVE' ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.contextMenuItem}
                  accessibilityLabel={t('activities.disable')}
                onPress={() => runMenuAction(() => handleDisable(menuActivity))}
                >
                  <Ionicons
                    name="power-outline"
                    size={20}
                    color={colors.textPrimary}
                  />
                  <Text style={styles.contextMenuText}>
                    {t('activities.disable')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={modalVisible && formOwner.current === userId} animationType="slide" transparent onRequestClose={closeForm}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={[styles.modalCard, { paddingBottom: Math.max(16, insets.bottom) }]}>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.formFields}>
              <Text
                style={[
                  styles.modalTitle,
                  editingActivity && { marginBottom: spacing.xs },
                ]}
              >
                {editingActivity ? t('activities.editTask') : t('activities.createTask')}
              </Text>
              {editingActivity ? (
                <Text style={styles.editOriginalHint}>
                  {t('activities.editOriginalHint')}
                </Text>
              ) : null}

              <Text style={styles.label}>{t('activities.title')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('activities.placeholder')}
                accessibilityLabel={t('activities.title')}
                returnKeyType="done"
                value={title}
                maxLength={200}
                editable={!submitting}
                onChangeText={setTitle}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>{t('activities.type')}</Text>
              <View style={styles.typeGrid}>
                {activityTypes.map(({ type, label }) => (
                  <TouchableOpacity
                    key={type}
                    accessibilityRole="radio" accessibilityState={{ checked: selectedType === type }}
                    style={[
                      styles.typeChip,
                      selectedType === type && { backgroundColor: `${activityColor[type]}22`, borderColor: activityColor[type] },
                    ]}
                    disabled={submitting}
                    onPress={() => setSelectedType(type)}
                  >
                    <Text style={[
                      styles.typeChipText,
                      selectedType === type && { color: colors.textPrimary },
                    ]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('activities.description')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                accessibilityLabel={t('activities.description')}
                placeholder={t('activities.descriptionPlaceholder')}
                value={description}
                maxLength={5000}
                editable={!submitting}
                onChangeText={setDescription}
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={styles.label}>{t('activities.scheduleType')}</Text>
              <View style={styles.typeGrid}>
                {scheduleOptions.map(({ type, label }) => (
                  <TouchableOpacity
                    key={type}
                    accessibilityRole="radio" accessibilityState={{ checked: scheduleType === type }}
                    disabled={submitting}
                    style={[
                      styles.typeChip,
                      scheduleType === type && styles.selectedScheduleChip,
                    ]}
                    onPress={() => {
                      if (submittingRef.current) return;
                      setScheduleType(type);
                      if (type !== 'DATE') setDueDate(null);
                    }}
                  >
                    <Text style={[
                      styles.typeChipText,
                      scheduleType === type && { color: colors.textOnPrimary },
                    ]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {scheduleType === 'DATE' ? (
                <>
                  <Text style={styles.label}>{t('activities.date')}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.pickerButton}
                    onPress={() => setPickerMode(pickerMode === 'date' ? null : 'date')}
                  >
                    <Text style={styles.pickerButtonText}>
                      {dueDate ? dueDate.toLocaleDateString(getLocale(language)) : t('activities.pickDate')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <Text style={styles.label}>{t('activities.timeOptional')}</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.pickerButton, { flex: 1 }]}
                  onPress={() => setPickerMode(pickerMode === 'time' ? null : 'time')}
                >
                  <Text style={styles.pickerButtonText}>
                    {dueTime
                      ? dueTime.toLocaleTimeString(getLocale(language), { hour: '2-digit', minute: '2-digit' })
                      : t('activities.pickTime')}
                  </Text>
                </TouchableOpacity>
                {dueTime ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.clearTimeButton}
                    onPress={() => setDueTime(null)}
                  >
                    <Text style={styles.secondaryButtonText}>{t('activities.clearTime')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {pickerMode === 'date' ? (
                <DateTimePicker
                  value={dueDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant={theme.mode}
                  textColor={colors.textPrimary}
                  accentColor={colors.primary}
                  onChange={(_, selectedDate) => {
                    if (Platform.OS !== 'ios') setPickerMode(null);
                    if (selectedDate) setDueDate(selectedDate);
                  }}
                />
              ) : null}

              {pickerMode === 'time' ? (
                <DateTimePicker
                  value={dueTime ?? new Date()}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant={theme.mode}
                  textColor={colors.textPrimary}
                  accentColor={colors.primary}
                  onChange={(_, selectedTime) => {
                    if (Platform.OS !== 'ios') setPickerMode(null);
                    if (selectedTime) setDueTime(selectedTime);
                  }}
                />
              ) : null}

            </ScrollView>
            <View style={styles.formActions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.submitButton, submitting && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={submitting}
              >
                <Text style={styles.submitText}>
                  {submitting ? t('common.saving') : t('common.save')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={submitting}
                style={styles.cancelButton}
                onPress={closeForm}
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CompletionCelebration
        data={completionCelebration}
        onDismiss={() => setCompletionCelebration(null)}
        visible={Boolean(completionCelebration)}
      />
    </View>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  list: { ...pageContent },
  dailyProgressCard: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.primaryShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  progressRing: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingSegments: {
    width: 64,
    height: 64,
    position: 'absolute',
  },
  progressRingSegment: {
    position: 'absolute',
    width: 4,
    height: 8,
    borderRadius: borderRadius.full,
  },
  progressRingText: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  dailyProgressContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  dailyProgressLabel: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
  dailyProgressCount: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  progressStar: {
    width: 45,
    height: 45,
    marginLeft: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.starTile,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  logButton: {
    backgroundColor: colors.primary,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  logButtonText: { ...typography.bodyBold, color: colors.textOnPrimary },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconEmoji: {
    fontSize: 21,
  },
  cardContent: {
    flex: 1,
  },
  titleRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  rowTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    flex: 1,
  },
  rowMeta: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  streakText: {
    ...typography.tiny,
    color: colors.streakFire,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  description: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 19,
  },
  motivationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successSurface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  motivationText: {
    ...typography.tiny,
    color: colors.successText,
  },
  secondaryButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  secondaryButtonText: { ...typography.small, color: colors.textPrimary },
  completeButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    marginTop: spacing.md,
  },
  completeButtonText: { ...typography.bodyBold, color: colors.textOnPrimary },
  completedButton: {
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  completedButtonText: {
    color: colors.successText,
  },
  disabledButton: { opacity: 0.55 },
  menuModal: {
    flex: 1,
  },
  contextMenu: {
    position: 'absolute',
    width: 208,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  contextMenuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  contextMenuText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '92%', width: '100%', maxWidth: 720, alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.md,
  },
  formFields: { flexShrink: 1 },
  formActions: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  cancelButton: { minHeight: 44, justifyContent: 'center' },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  editOriginalHint: {
    ...typography.tiny,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  label: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.xs },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedScheduleChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { ...typography.small, color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  pickerButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  pickerButtonText: { ...typography.body, color: colors.textPrimary },
  timeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  clearTimeButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  submitText: { ...typography.bodyBold, color: colors.textOnPrimary },
  cancelText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  });
};

type ActivityScreenStyles = ReturnType<typeof createStyles>;
