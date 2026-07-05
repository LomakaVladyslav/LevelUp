import type { ComponentRef } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
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
  const theme = useTheme();
  const { colors, activityColor } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>([]);
  const [todayProgress, setTodayProgress] = useState<TodayProgress>(
    EMPTY_TODAY_PROGRESS,
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<PlannedActivity | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType>('STUDY');
  const [scheduleType, setScheduleType] = useState<PlannedActivityScheduleType>('SIMPLE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionCelebration, setCompletionCelebration] =
    useState<CompletionCelebrationData | null>(null);
  const [menuActivity, setMenuActivity] = useState<PlannedActivity | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuButtonRefs = useRef<
    Record<string, ComponentRef<typeof View> | null>
  >({});
  const refreshUser = useAuthStore((s) => s.refreshUser);

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

  const loadActivities = useCallback(async () => {
    try {
      const data = await plannedActivityService.getAll();
      setPlannedActivities(data.plannedActivities);
      setTodayProgress(data.todayProgress ?? EMPTY_TODAY_PROGRESS);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      void loadActivities();
    }, [loadActivities])
  );

  const resetForm = (activity?: PlannedActivity) => {
    setEditingActivity(activity ?? null);
    setSelectedType(activity?.type ?? 'STUDY');
    setScheduleType(activity?.scheduleType ?? 'SIMPLE');
    setTitle(activity?.title ?? '');
    setDescription(activity?.description ?? '');
    setDueDate(activity?.dueDate ? parseStoredDate(activity.dueDate) : null);
    setDueTime(minutesToDate(activity?.dueTimeMinutes));
    setPickerMode(null);
  };

  const closeActionsMenu = () => {
    setMenuActivity(null);
    setMenuPosition(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
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

    setSubmitting(true);
    try {
      const result = editingActivity
        ? await plannedActivityService.update(editingActivity.id, payload)
        : await plannedActivityService.create(payload);

      try {
        await notificationService.rescheduleActivityReminder(result.plannedActivity, language);
      } catch (error) {
        handleNotificationError(error);
      }

      setModalVisible(false);
      resetForm();
      await loadActivities();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('activities.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const showCompletionResult = async (activity: PlannedActivity, result: Awaited<ReturnType<typeof plannedActivityService.complete>>) => {
    try {
      await refreshUser();
    } catch (error) {
      console.error(error);
    }

    if (activity.scheduleType !== 'DAILY') {
      await notificationService.cancelActivityReminder(activity.id);
    }

    const variant: CompletionCelebrationData['variant'] = result.levelUp
      ? 'levelUp'
      : result.newAchievements.length > 0
        ? 'achievement'
        : 'completed';

    setCompletionCelebration({ variant });
  };

  const handleComplete = async (activity: PlannedActivity) => {
    if (activity.scheduleType === 'DAILY' && activity.isCompletedToday) return;

    setCompletingId(activity.id);
    try {
      const result = await plannedActivityService.complete(activity.id);
      await showCompletionResult(activity, result);
      await loadActivities();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('activities.completeFailed'));
    } finally {
      setCompletingId(null);
    }
  };

  const handleDelete = (activity: PlannedActivity) => {
    closeActionsMenu();
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
              try {
                await plannedActivityService.delete(activity.id);
                await notificationService.cancelActivityReminder(activity.id);
                await loadActivities();
              } catch (e: any) {
                Alert.alert(t('common.error'), e.response?.data?.error || t('activities.deleteFailed'));
              }
            })();
          },
        },
      ],
    );
  };

  const handleDisable = (activity: PlannedActivity) => {
    closeActionsMenu();
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
              try {
                await plannedActivityService.update(activity.id, { status: 'DISABLED' });
                await notificationService.cancelActivityReminder(activity.id);
                await loadActivities();
              } catch (e: any) {
                Alert.alert(t('common.error'), e.response?.data?.error || t('activities.disableFailed'));
              }
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

  const fallbackMotivation = (type: ActivityType) => {
    switch (type) {
      case 'STUDY':
        return t('activities.motivationFallbackStudy');
      case 'WORKOUT':
        return t('activities.motivationFallbackWorkout');
      case 'HABIT':
        return t('activities.motivationFallbackHabit');
      case 'CUSTOM':
        return t('activities.motivationFallbackCustom');
    }
  };

  const activityMotivationText = (activity: PlannedActivity) =>
    activity.displayMotivationText?.trim() ||
    activity.motivationText?.trim() ||
    fallbackMotivation(activity.type);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
              setRefreshing(true);
              void loadActivities();
            }}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.dailyProgressCard}>
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
            </View>

            <TouchableOpacity
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
          <Text style={styles.emptyText}>{t('activities.noPlannedActivities')}</Text>
        }
        renderItem={({ item: activity }) => {
          const completedToday = activity.scheduleType === 'DAILY' && activity.isCompletedToday;

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
                  <Text style={styles.activityIconEmoji}>
                    {activityEmoji[activity.type]}
                  </Text>
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {activity.displayTitle || activity.title}
                    </Text>
                    <View
                      ref={(ref) => {
                        menuButtonRefs.current[activity.id] = ref;
                      }}
                      collapsable={false}
                    >
                      <TouchableOpacity
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
                    <Text style={styles.description}>
                      {activity.displayDescription || activity.description}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.motivationBadge}>
                <Ionicons name="star" size={13} color={colors.success} />
                <Text style={styles.motivationText}>
                  {activityMotivationText(activity)}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.completeButton,
                  completedToday && styles.completedButton,
                  completingId === activity.id && styles.disabledButton,
                ]}
                onPress={() => handleComplete(activity)}
                disabled={completedToday || completingId === activity.id}
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
                  {completingId === activity.id
                    ? t('activities.completing')
                    : completedToday
                      ? t('activities.completed')
                      : t('activities.complete')}
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
                style={styles.contextMenuItem}
                onPress={() => openEditModal(menuActivity)}
              >
                <Ionicons
                  name="create-outline"
                  size={20}
                  color={colors.textPrimary}
                />
                <Text style={styles.contextMenuText}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => handleDelete(menuActivity)}
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
              {menuActivity.scheduleType === 'DAILY' ? (
                <TouchableOpacity
                  style={styles.contextMenuItem}
                  onPress={() => handleDisable(menuActivity)}
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

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
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

              <Text style={styles.label}>{t('activities.type')}</Text>
              <View style={styles.typeGrid}>
                {activityTypes.map(({ type, label }) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      selectedType === type && { backgroundColor: activityColor[type] },
                    ]}
                    onPress={() => setSelectedType(type)}
                  >
                    <Text style={[
                      styles.typeChipText,
                      selectedType === type && { color: colors.textOnPrimary },
                    ]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('activities.title')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('activities.placeholder')}
                value={title}
                onChangeText={setTitle}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>{t('activities.description')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('activities.descriptionPlaceholder')}
                value={description}
                onChangeText={setDescription}
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={styles.label}>{t('activities.scheduleType')}</Text>
              <View style={styles.typeGrid}>
                {scheduleOptions.map(({ type, label }) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      scheduleType === type && styles.selectedScheduleChip,
                    ]}
                    onPress={() => {
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

              <TouchableOpacity
                style={[styles.submitButton, submitting && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={submitting}
              >
                <Text style={styles.submitText}>
                  {submitting ? t('common.saving') : t('common.save')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
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
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
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
    width: 30,
    height: 30,
    marginTop: -5,
    marginRight: -5,
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
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  editOriginalHint: {
    ...typography.tiny,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  label: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.xs },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
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
