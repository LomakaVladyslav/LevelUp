import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { plannedActivityService } from '../../services/plannedActivity.service';
import { notificationService } from '../../services/notification.service';
import {
  ActivityType,
  PlannedActivity,
  PlannedActivityInput,
  PlannedActivityScheduleType,
} from '../../types';
import {
  colors, spacing, borderRadius, typography,
  activityColor, activityEmoji,
} from '../../constants/theme';
import { useAuthStore } from '../../stores/auth.store';
import { useT } from '../../hooks/useT';
import { useSettingsStore } from '../../stores/settings.store';

type PickerMode = 'date' | 'time' | null;

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
  const language = useSettingsStore((s) => s.language);
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>([]);
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
    return date ? date.toLocaleDateString(language) : '';
  };

  const formatTime = (minutes?: number | null) => {
    const date = minutesToDate(minutes);
    return date
      ? date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
      : '';
  };

  const loadActivities = useCallback(async () => {
    try {
      const data = await plannedActivityService.getAll();
      setPlannedActivities(data.plannedActivities);
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

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (activity: PlannedActivity) => {
    resetForm(activity);
    setModalVisible(true);
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

    const messages = [
      t('activities.xpBreakdown', {
        base: result.xpBreakdown.baseXp,
        streak: result.xpBreakdown.streakBonus,
        balance: result.xpBreakdown.balanceBonus,
        comeback: result.xpBreakdown.comebackBonus,
        total: result.xpBreakdown.totalXp,
      }),
    ];

    if (result.levelUp) {
      messages.unshift(
        t('activities.levelUpBody', { level: result.newLevel }),
      );
    }

    if (result.newAchievements.length > 0) {
      const names = result.newAchievements
        .map((achievement) => `${achievement.iconEmoji} ${achievement.name}`)
        .join('\n');
      messages.push(`${t('activities.achievementUnlocked')}\n${names}`);
    }

    const title = result.levelUp
      ? t('activities.levelUp')
      : result.newAchievements.length > 0
        ? t('activities.achievementUnlocked')
        : t('activities.completedTitle');

    Alert.alert(title, messages.join('\n\n'));
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.logButton}
        onPress={openCreateModal}
      >
        <Text style={styles.logButtonText}>{t('activities.createTaskButton')}</Text>
      </TouchableOpacity>

      <ScrollView
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
      >
        {plannedActivities.length === 0 ? (
          <Text style={styles.emptyText}>{t('activities.noPlannedActivities')}</Text>
        ) : (
          plannedActivities.map((activity) => {
            const completedToday = activity.scheduleType === 'DAILY' && activity.isCompletedToday;
            return (
              <View key={activity.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.typeDot, { backgroundColor: activityColor[activity.type] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {activity.displayTitle || activity.title}
                    </Text>
                    <Text style={styles.rowMeta}>{activityMeta(activity)}</Text>
                    {activity.displayDescription || activity.description ? (
                      <Text style={styles.description}>
                        {activity.displayDescription || activity.description}
                      </Text>
                    ) : null}
                  </View>
                  {completedToday ? (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>{t('activities.doneToday')}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => openEditModal(activity)}
                  >
                    <Text style={styles.secondaryButtonText}>{t('common.edit')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleDelete(activity)}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.danger }]}>
                      {t('common.delete')}
                    </Text>
                  </TouchableOpacity>

                  {activity.scheduleType === 'DAILY' ? (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => handleDisable(activity)}
                    >
                      <Text style={styles.secondaryButtonText}>{t('activities.disable')}</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.completeButton,
                      (completedToday || completingId === activity.id) && styles.disabledButton,
                    ]}
                    onPress={() => handleComplete(activity)}
                    disabled={completedToday || completingId === activity.id}
                  >
                    <Text style={styles.completeButtonText}>
                      {completingId === activity.id
                        ? t('activities.completing')
                        : completedToday
                          ? t('activities.completed')
                          : t('activities.complete')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

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
                      selectedType === type && { color: '#fff' },
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
                      scheduleType === type && { color: '#fff' },
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
                      {dueDate ? dueDate.toLocaleDateString(language) : t('activities.pickDate')}
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
                      ? dueTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logButton: {
    backgroundColor: colors.primary,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  logButtonText: { ...typography.bodyBold, color: '#fff' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  typeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  rowTitle: { ...typography.bodyBold, color: colors.textPrimary },
  rowMeta: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  description: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xs },
  doneBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  doneBadgeText: { ...typography.tiny, color: colors.primaryDark },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
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
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.success,
  },
  completeButtonText: { ...typography.small, color: '#fff', fontWeight: '600' },
  disabledButton: { opacity: 0.55 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  submitText: { ...typography.bodyBold, color: '#fff' },
  cancelText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
