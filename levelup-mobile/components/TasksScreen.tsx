import { CacheNotice } from './CacheNotice';
import { TodayCompleted } from './TodayCompleted';
import { todayTasks, dailyGroup, filterTasks, taskFilters, TaskFilter, completedOnToday } from '../utils/daily-tasks';
import { reconcileTaskReminders } from '../services/reconcile-task-reminders';
import { isRecurring, isScheduledOn, dateKeyInZone, scheduleOnDate } from '../services/reminder-time';
import { EmptyState, pageContent } from '../components/ScreenUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completePlannedActivity } from '../services/complete-planned-activity';
import { orderTasks } from '../utils/task-order';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { userData } from '../services/user-data';
import { useScreenResource } from '../hooks/useScreenResource';
import { ResourceError } from '../components/ResourceError';
import { apiContext } from '../services/api-context';
import { getApiErrorMessage } from '../utils/api-error';
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
  AppState,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { plannedActivityService } from '../services/plannedActivity.service';
import { notificationService } from '../services/notification.service';
import {
  ActivityType,
  PlannedActivity,
  PlannedActivityInput,
  PlannedActivityScheduleType,
  TodayProgress,
} from '../types';
import {
  AppTheme,
  spacing,
  borderRadius,
  typography,
  activityEmoji,
} from '../constants/theme';
import { useAuthStore } from '../stores/auth.store';
import { useT } from '../hooks/useT';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../stores/settings.store';
import { getLocale, getPluralKey } from '../constants/i18n';
import {
  CompletionCelebration,
  CompletionCelebrationData,
} from '../components/CompletionCelebration';

type PickerMode = 'date' | 'time' | null;
type MenuPosition = { top: number; left: number };

const EMPTY_TODAY_PROGRESS: TodayProgress = {
  completed: 0,
  total: 0,
  percentage: 0,
};

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

export default function TasksScreen({ today = false }: { today?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { create, taskId } = useLocalSearchParams<{ create?: string; taskId?: string }>();
  const consumedCreate = useRef(false);
  const consumedTask = useRef('');
  const theme = useTheme();
  const { colors, activityColor } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { data, setData, error, loading, refreshing, cached, savedAt, reload: loadActivities } = useScreenResource(() => plannedActivityService.getAll(true, true), 'tasks');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const formSequence = useRef(0);
  useEffect(() => () => { ++formSequence.current; }, []);
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [reminder, setReminder] = useState(true);
  const [paused, setPaused] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const plannedActivities = useMemo(() => today ? todayTasks(data?.plannedActivities ?? [], now) : orderTasks(filterTasks(data?.plannedActivities ?? [], filter, search)), [data, today, filter, search, now]);
  const submittingRef = useRef(false);
  const mutationRef = useRef(false);
  const userId = useAuthStore((state) => state.user?.id);
  const formOwner = useRef(userId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<PlannedActivity | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType>('CUSTOM');
  const [scheduleType, setScheduleType] = useState<PlannedActivityScheduleType>('SIMPLE');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
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
    { type: 'WEEKLY', label: t('taskEngine.selectedDays') },
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
      case 'WEEKLY':
        return t('taskEngine.selectedDays');
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
    if (!modalVisible || !userId || submitting || formOwner.current !== userId) return;
    const draft = { reminder, paused, title, description, selectedType, scheduleType, weekdays, dueDate: dueDate ? dateToDateOnly(dueDate) : null, dueTimeMinutes: dateToMinutes(dueTime) };
    // Queue every draft snapshot immediately; closing or backgrounding cannot cancel the latest text.
    void userData.saveDraft(userId, JSON.stringify(draft), editingActivity?.id).then(() => setDraftError(false)).catch(() => setDraftError(true));
  }, [modalVisible, editingActivity, userId, submitting, reminder, paused, title, description, selectedType, scheduleType, weekdays, dueDate, dueTime]);

  const resetForm = useCallback((activity?: PlannedActivity) => {
    setEditingActivity(activity ?? null);
    setSelectedType(activity?.type ?? 'CUSTOM');
    setScheduleType(activity?.scheduleType ?? (today ? 'DATE' : 'SIMPLE'));
    setWeekdays(activity?.weekdays?.length ? activity.weekdays : [1, 2, 3, 4, 5]);
    setTitle(activity?.title ?? '');
    setDescription(activity?.description ?? '');
    setDueDate(activity?.dueDate ? parseStoredDate(activity.dueDate) : today && !activity ? new Date() : null);
    setDueTime(minutesToDate(activity?.dueTimeMinutes));
    setPickerMode(null);
    setAdvanced(Boolean(activity)); setReminder(true); setPaused(activity?.status === 'DISABLED'); setDraftRestored(false); setDraftError(false);
  }, [today]);

  useEffect(() => {
    if (formOwner.current === userId) return;
    formOwner.current = userId;
    ++formSequence.current;
    setSearch(''); setFilter('open'); setShowCompleted(false);
    resetForm();
    setModalVisible(false);
    setMenuActivity(null);
    setCompletionCelebration(null);
  }, [userId, resetForm]);

  const closeActionsMenu = () => {
    setMenuActivity(null);
    setMenuPosition(null);
  };

  const openForm = useCallback(async (activity?: PlannedActivity) => {
    const request = ++formSequence.current;
    resetForm(activity);
    const session = apiContext.get().sessionVersion;
    try {
      const value = userId ? await userData.readDraft(userId, activity?.id) : null;
      const draft = value ? JSON.parse(value) : null;
      if (session !== apiContext.get().sessionVersion || request !== formSequence.current) return;
      if (activity && userId) setReminder(await userData.reminderEnabled(userId, activity.id));
      if (session !== apiContext.get().sessionVersion || request !== formSequence.current) return;
      if (draft && typeof draft.title === 'string' && typeof draft.description === 'string') {
        if (Array.isArray(draft.weekdays) && draft.weekdays.length && draft.weekdays.every((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)) setWeekdays(draft.weekdays);
        setTitle(draft.title); setDescription(draft.description);
        setDraftRestored(true);
        if (typeof draft.reminder === 'boolean') setReminder(draft.reminder);
        if (activity && typeof draft.paused === 'boolean') setPaused(draft.paused);
        if (draft.description.trim() || (draft.scheduleType && draft.scheduleType !== 'SIMPLE')) setAdvanced(true);
        if (['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'].includes(draft.selectedType)) setSelectedType(draft.selectedType);
        if (['SIMPLE', 'DAILY', 'WEEKLY', 'DATE'].includes(draft.scheduleType)) setScheduleType(draft.scheduleType);
        if (draft.dueDate === null) setDueDate(null);
        else if (draft.dueDate && Number.isFinite(Date.parse(draft.dueDate))) setDueDate(draft.dueDate.length === 10 ? parseStoredDate(draft.dueDate) : new Date(draft.dueDate));
        if (draft.dueTimeMinutes === null || draft.dueTime === null) setDueTime(null);
        else if (Number.isInteger(draft.dueTimeMinutes) && draft.dueTimeMinutes >= 0 && draft.dueTimeMinutes < 1440) setDueTime(minutesToDate(draft.dueTimeMinutes));
        else if (draft.dueTime && Number.isFinite(Date.parse(draft.dueTime))) setDueTime(new Date(draft.dueTime));
      }
    } catch { /* A corrupt draft must not block creating an activity. */ }
    if (session === apiContext.get().sessionVersion && request === formSequence.current) setModalVisible(true);
  }, [userId, resetForm]);

  useEffect(() => {
    if (create !== '1') { consumedCreate.current = false; return; }
    if (consumedCreate.current) return;
    consumedCreate.current = true;
    router.setParams({ create: undefined });
    setFilter('open');
    void openForm();
  }, [create, router, openForm]);

  useEffect(() => {
    if (!taskId) { consumedTask.current = ''; return; }
    if (!data) return;
    const key = `${userId}:${taskId}`;
    if (consumedTask.current === key) return;
    const task = data.plannedActivities.find((item) => item.id === taskId);
    // A disk snapshot may predate the notified task. Wait for the network result.
    if (!task && cached) return;
    consumedTask.current = key;
    router.setParams({ taskId: undefined });
    if (task?.status === 'COMPLETED') router.navigate('/(tabs)/activity-history');
    else if (task) { setFilter(task.status === 'DISABLED' ? 'paused' : 'all'); void openForm(task); }
    else Alert.alert(t('taskEngine.unavailable'));
  }, [taskId, data, router, openForm, t, cached, userId]);

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
    void openForm(activity);
  };

  const openActionsMenu = (activity: PlannedActivity) => {
    const menuButton = menuButtonRefs.current[activity.id];
    if (!menuButton) return;

    menuButton.measureInWindow((x, y, width, height) => {
      const menuWidth = 208;
      const menuHeight = isRecurring(activity.scheduleType) ? 156 : 108;

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

    console.error('Could not update activity reminder');
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

    if (scheduleType === 'WEEKLY' && !weekdays.length) { Alert.alert(t('common.error'), t('taskEngine.chooseDays')); return; }
    const payload: PlannedActivityInput = {
      type: selectedType,
      title: title.trim(),
      description: description.trim() || null,
      scheduleType,
      weekdays: scheduleType === 'WEEKLY' ? weekdays : [],
      dueDate: scheduleType === 'DATE' && dueDate ? dateToDateOnly(dueDate) : null,
      dueTimeMinutes: scheduleType === 'SIMPLE' ? null : dateToMinutes(dueTime),
      timezone: getDeviceTimezone(),
    };

    Keyboard.dismiss();
    submittingRef.current = true;
    setSubmitting(true);
    const session = apiContext.get().sessionVersion;
    try {
      const result = editingActivity
        ? await plannedActivityService.update(editingActivity.id, { ...payload, timezone: editingActivity.timezone, updatedAt: editingActivity.updatedAt, ...(isRecurring(scheduleType) && paused !== (editingActivity.status === 'DISABLED') ? { status: paused ? 'DISABLED' : 'ACTIVE' } : {}) })
        : await plannedActivityService.create(payload);

      if (session !== apiContext.get().sessionVersion) return;
      setData((current) => ({
        plannedActivities: [result.plannedActivity, ...(current?.plannedActivities ?? []).filter((activity) => activity.id !== result.plannedActivity.id)],
        todayProgress: current?.todayProgress ?? EMPTY_TODAY_PROGRESS,
      }));
      setModalVisible(false);
      if (!editingActivity) setFilter('open');
      else if (paused !== (editingActivity.status === 'DISABLED')) setFilter(paused ? 'paused' : 'open');
      if (userId) {
        const storage = await Promise.allSettled([
          userData.removeDraft(userId, editingActivity?.id),
          userData.setReminder(userId, result.plannedActivity.id, reminder),
        ]);
        if (session === apiContext.get().sessionVersion && storage.some(item => item.status === 'rejected')) Alert.alert(t('common.error'), t('daily.storageFailed'));
      }
      if (session !== apiContext.get().sessionVersion) return;
      resetForm();
      void loadActivities();
      void reconcileTaskReminders(result.plannedActivity.id).catch(handleNotificationError);

    } catch (e: any) {
      if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), getApiErrorMessage(e, t, 'activities.saveFailed'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleComplete = async (activity: PlannedActivity) => {
    if (mutationRef.current || (isRecurring(activity.scheduleType) && completedOnToday(activity, now))) return;
    mutationRef.current = true;
    setCompletingId(activity.id);
    const session = apiContext.get().sessionVersion;
    try {
      const result = await completePlannedActivity({ ...activity, occurrenceDate: dateKeyInZone(new Date(), activity.timezone) });
      if (session !== apiContext.get().sessionVersion) return;
      setData((current) => ({
        plannedActivities: (current?.plannedActivities ?? []).map((item) => item.id !== activity.id ? item : {
          ...item, isCompletedToday: true, completedTodayAt: result.activity.completedAt,
          occurrenceDate: result.activity.completedForDate?.slice(0, 10) ?? dateKeyInZone(new Date(result.activity.completedAt), item.timezone),
          completedAt: isRecurring(item.scheduleType) ? item.completedAt : result.activity.completedAt,
          status: isRecurring(item.scheduleType) ? 'ACTIVE' : 'COMPLETED',
        }),
        todayProgress: current?.todayProgress ?? EMPTY_TODAY_PROGRESS,
      }));
      setCompletionCelebration({ activityId: result.activity.id, variant: result.levelUp ? 'levelUp' : result.newAchievements.length ? 'achievement' : 'completed', xpGained: result.xpGained + (result.achievementXpGained ?? 0), newLevel: result.newLevel });
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
      await plannedActivityService.update(activity.id, { status: 'ACTIVE', updatedAt: activity.updatedAt });
      if (session !== apiContext.get().sessionVersion) return;
      removeVisibleActivity(activity.id, 'ACTIVE');
      void loadActivities();
      void reconcileTaskReminders(activity.id).catch(handleNotificationError);

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
                removeVisibleActivity(activity.id, 'DISABLED');
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
    const effective = today ? scheduleOnDate(activity, dateKeyInZone(now, activity.timezone)) : undefined;
    if (effective) activity = { ...activity, scheduleType: effective.scheduleType, dueTimeMinutes: effective.dueTimeMinutes, dueDate: effective.dueDate, weekdays: effective.weekdays };
    const parts = today ? [scheduleLabel(activity.scheduleType)] : [activityLabel(activity.type), scheduleLabel(activity.scheduleType)];
    if (activity.scheduleType === 'WEEKLY') parts.push((activity.weekdays ?? []).map(day => new Intl.DateTimeFormat(getLocale(language), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + day)))).join(', '));

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
        contentContainerStyle={[styles.list, { paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}
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
            <CacheNotice cached={cached} savedAt={savedAt} error={error} />
            {today ? <Text accessibilityRole="header" style={[styles.modalTitle, { marginTop: 8 }]}>{new Date().toLocaleDateString(getLocale(language), { weekday: 'long', day: 'numeric', month: 'long' })}</Text> : <>
              <TextInput accessibilityLabel={t('daily.search')} placeholder={t('daily.search')} value={search} onChangeText={setSearch} style={styles.input} placeholderTextColor={colors.textMuted} returnKeyType="search" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
                {taskFilters.map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.typeChip, filter === value && styles.selectedScheduleChip]}>
                  <Text style={[styles.typeChipText, filter === value && { color: colors.textOnPrimary }]}>{t(`daily.${value}`)}</Text>
                </TouchableOpacity>)}
              </ScrollView>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.navigate('/(tabs)/activity-history')} style={{ minHeight: 44, justifyContent: 'center', marginBottom: 8 }}><Text style={{ color: colors.primary }}>{t('activities.history')} →</Text></TouchableOpacity>
            </>}

            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t(today ? 'daily.quickAdd' : 'activities.createTaskButton')}
              style={styles.logButton}
              onPress={() => { void openForm(); }}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color={colors.textOnPrimary} />
              <Text style={styles.logButtonText}>
                {t(today ? 'daily.quickAdd' : 'activities.createTaskButton')}
              </Text>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          loading ? <ActivityIndicator size="large" color={colors.primary} /> : !error ? <EmptyState title={t(today ? 'daily.noTasks' : 'daily.noResults')} message={t(today ? 'daily.emptyHelp' : 'daily.filterHelp')} /> : null
        }
        ListFooterComponent={today ? <View style={{ marginTop: 16, gap: 12 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showCompleted }} onPress={() => setShowCompleted(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}>
            <Text style={styles.modalTitle}>{t('daily.completed')} {showCompleted ? '−' : '+'}</Text>
          </TouchableOpacity>
          {showCompleted ? <TodayCompleted /> : null}
        </View> : null}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: activity, index }) => {
          const completedToday = activity.status === 'COMPLETED' || (activity.status === 'ACTIVE' && isRecurring(activity.scheduleType) && completedOnToday(activity, now));
          const notScheduled = activity.status === 'ACTIVE' && isRecurring(activity.scheduleType) && !isScheduledOn(activity, dateKeyInZone(new Date(), activity.timezone));
          const actionLabel = notScheduled ? t('taskEngine.notScheduled') : t(completingId === activity.id ? 'activities.completing' : completedToday ? 'activities.completed' : activity.status === 'DISABLED' ? 'activities.resume' : 'activities.complete');

          return (
            <View>
              {today && (index === 0 || dailyGroup(plannedActivities[index - 1], now) !== dailyGroup(activity, now)) ? <Text accessibilityRole="header" style={styles.modalTitle}>{t(dailyGroup(activity, now) === 'overdue' ? 'daily.overdue' : 'daily.today')}</Text> : null}
            <View style={[styles.card, today && { borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, shadowOpacity: 0, elevation: 0, backgroundColor: colors.background, paddingHorizontal: 0 } ]}>
              <View style={styles.cardHeader}>
                {!today ? <View
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
                </View> : null}
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t('common.edit')}: ${activity.displayTitle || activity.title}`} onPress={() => activity.status === 'COMPLETED' ? router.navigate('/(tabs)/activity-history') : openEditModal(activity)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                      <Text style={styles.rowTitle} >{activity.displayTitle || activity.title}</Text>
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
                        onPress={() => activity.status === 'COMPLETED' ? router.navigate('/(tabs)/activity-history') : openActionsMenu(activity)}
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
                  {!today && isRecurring(activity.scheduleType) ? (
                    <Text style={styles.streakText}>
                      {streakLabel(activity.streakDays ?? 0)} 🔥
                    </Text>
                  ) : null}
                  {activity.displayDescription || activity.description ? (
                    <Text style={styles.description} >
                      {activity.displayDescription || activity.description}
                    </Text>
                  ) : null}
                </View>
              </View>

              {!today && activityMotivationText(activity) ? <View style={styles.motivationBadge}>
                <Ionicons name="star" size={13} color={colors.success} />
                <Text style={styles.motivationText}>
                  {activityMotivationText(activity)}
                </Text>
              </View> : null}

              <TouchableOpacity
                accessibilityLabel={`${actionLabel}: ${activity.displayTitle || activity.title}`}
                accessibilityRole="button" accessibilityState={{ disabled: completedToday || notScheduled || Boolean(completingId), busy: completingId === activity.id }}
                style={[
                  styles.completeButton,
                  completedToday && styles.completedButton,
                  completingId === activity.id && styles.disabledButton,
                ]}
                onPress={() => { void (activity.status === 'DISABLED' ? handleResume(activity) : handleComplete(activity)); }}
                disabled={completedToday || notScheduled || Boolean(completingId)}
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
              {isRecurring(menuActivity.scheduleType) && menuActivity.status === 'ACTIVE' ? (
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
                onSubmitEditing={() => { void handleSave(); }}
                autoFocus
                value={title}
                maxLength={200}
                editable={!submitting}
                onChangeText={setTitle}
                placeholderTextColor={colors.textMuted}
              />

              {draftRestored ? <Text style={styles.label}>{t('daily.draftRestored')}</Text> : null}
              {draftError ? <Text accessibilityRole="alert" style={styles.label}>{t('daily.draftError')}</Text> : null}
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(value => !value)} style={styles.pickerButton}>
                <Text style={styles.pickerButtonText}>{t(advanced ? 'daily.less' : 'daily.more')}</Text>
              </TouchableOpacity>
              {advanced ? <View pointerEvents={submitting ? 'none' : 'auto'}>
              <Text style={styles.label}>{t('taskEngine.categoryOptional')}</Text>
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
                {scheduleOptions.filter(({ type }) => !editingActivity || !isRecurring(editingActivity.scheduleType) || isRecurring(type)).map(({ type, label }) => (
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
                      if (type === 'SIMPLE') { setDueTime(null); setPickerMode(null); }
                    }}
                  >
                    <Text style={[
                      styles.typeChipText,
                      scheduleType === type && { color: colors.textOnPrimary },
                    ]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {scheduleType === 'WEEKLY' ? <View>
                <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} disabled={submitting} onPress={() => setWeekdays([1, 2, 3, 4, 5])}><Text style={styles.label}>{t('taskEngine.weekdays')}</Text></TouchableOpacity>
                <View style={styles.typeGrid}>{[1, 2, 3, 4, 5, 6, 0].map((day) => <TouchableOpacity key={day}
                  accessibilityRole="checkbox" accessibilityState={{ checked: weekdays.includes(day) }}
                  style={[styles.typeChip, weekdays.includes(day) && styles.selectedScheduleChip]}
                  onPress={() => setWeekdays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort())}>
                  <Text style={[styles.typeChipText, weekdays.includes(day) && { color: colors.textOnPrimary }]}>{new Intl.DateTimeFormat(getLocale(language), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + day)))}</Text>
                </TouchableOpacity>)}</View>
              </View> : null}
              {editingActivity && isRecurring(editingActivity.scheduleType) ? <Text style={styles.label}>{t('taskEngine.futureSchedule')}</Text> : null}
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

              {scheduleType !== 'SIMPLE' ? <>
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

              </> : null}

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

              {editingActivity && isRecurring(scheduleType) ? <TouchableOpacity accessibilityRole="switch" accessibilityLabel={t('daily.paused')} accessibilityState={{ checked: paused }} onPress={() => setPaused(value => !value)} style={styles.pickerButton}>
                <Text style={styles.pickerButtonText}>{paused ? '✓ ' : ''}{t('daily.paused')}</Text>
              </TouchableOpacity> : null}
              <TouchableOpacity accessibilityRole="switch" accessibilityLabel={t('daily.reminder')} accessibilityState={{ checked: reminder }} onPress={() => setReminder(value => !value)} style={styles.pickerButton}>
                <Text style={styles.pickerButtonText}>{reminder ? '✓ ' : ''}{t('daily.reminder')}</Text>
              </TouchableOpacity>
              <Text style={styles.label}>{t('daily.reminderHelp')}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => { closeForm(); router.navigate('/(tabs)/settings'); }} style={styles.pickerButton}><Text style={styles.pickerButtonText}>{t('tabs.settings')}</Text></TouchableOpacity>
              </View> : null}
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

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <TouchableOpacity accessibilityRole="button" disabled={submitting} style={[styles.cancelButton, { flexGrow: 1, paddingHorizontal: 8 }]} onPress={() => {
                if (!userId || submittingRef.current) return;
                const session = apiContext.get().sessionVersion;
                void userData.removeDraft(userId, editingActivity?.id).then(() => {
                  if (session !== apiContext.get().sessionVersion) return;
                  setModalVisible(false); resetForm();
                }).catch(() => setDraftError(true));
              }}><Text style={styles.cancelText}>{t('daily.discard')}</Text></TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={submitting}
                style={[styles.cancelButton, { flexGrow: 1, paddingHorizontal: 8 }]}
                onPress={closeForm}
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              </View>
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
    minHeight: 44,
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
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'flex-start' },
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


