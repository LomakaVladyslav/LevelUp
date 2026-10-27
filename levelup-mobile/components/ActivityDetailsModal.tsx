import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Activity, ActivityType } from '../types';
import {
  activityEmoji,
  AppTheme,
  borderRadius,
  spacing,
  typography,
} from '../constants/theme';
import { getLocale } from '../constants/i18n';
import { useT } from '../hooks/useT';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../stores/settings.store';

type Props = {
  activity: Activity | null;
  visible: boolean;
  onClose: () => void;
};

export function ActivityDetailsModal({ activity, visible, onClose }: Props) {
  const t = useT();
  const theme = useTheme();
  const { colors, activityColor } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);

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

  const completedAt = activity ? new Date(activity.completedAt) : null;
  const completedAtText =
    completedAt && !Number.isNaN(completedAt.getTime())
      ? completedAt.toLocaleString(getLocale(language))
      : activity?.completedAt ?? '';
  const title = activity?.displayTitle || activity?.title || '';
  const description = activity?.displayDescription || activity?.description || '';
  const typeColor = activity ? activityColor[activity.type] : colors.primary;

  return (
    <Modal
      visible={visible && Boolean(activity)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {activity ? (
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={[styles.iconBadge, { backgroundColor: `${typeColor}1A` }]}>
                <Text allowFontScaling={false} style={styles.iconText}>{activityEmoji[activity.type]}</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>{t('tabs.activityHistory')}</Text>
                <Text style={styles.subtitle}>{activityLabel(activity.type)}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button" accessibilityLabel={t('common.close')}
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.title, { marginBottom: 16 }]}>{title}</Text>
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{t('activities.type')}</Text>
                  <Text style={styles.detailValue}>{activityLabel(activity.type)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{t('activities.date')}</Text>
                  <Text style={styles.detailValue}>{completedAtText}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>XP</Text>
                  <Text style={[styles.detailValue, styles.xpValue]}>
                    +{activity.xpEarned} XP
                  </Text>
                </View>
              </View>

              {description.trim() ? (
                <View style={styles.descriptionBlock}>
                  <Text style={styles.detailLabel}>{t('activities.description')}</Text>
                  <Text style={styles.description}>{description}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.modalOverlay,
    },
    sheet: {
      maxHeight: '82%', width: '100%', maxWidth: 720, alignSelf: 'center',
      backgroundColor: colors.surface,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    handle: {
      width: 42,
      height: 4,
      alignSelf: 'center',
      borderRadius: borderRadius.full,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    iconBadge: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconText: {
      fontSize: 24,
    },
    headerText: {
      flex: 1,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      lineHeight: 24,
    },
    subtitle: {
      ...typography.small,
      color: colors.textSecondary,
      marginTop: 2,
    },
    closeButton: {
      width: 44,
      height: 44,
      marginTop: -4,
      marginRight: -8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
    },
    content: {
      flexShrink: 1,
    },
    contentInner: {
      paddingBottom: spacing.sm,
    },
    detailsGrid: {
      gap: spacing.sm,
    },
    detailItem: {
      minHeight: 58,
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    detailLabel: {
      ...typography.tiny,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    detailValue: {
      ...typography.bodyBold,
      color: colors.textPrimary,
    },
    xpValue: {
      color: colors.xpText,
    },
    descriptionBlock: {
      marginTop: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    description: {
      ...typography.body,
      color: colors.textPrimary,
      lineHeight: 22,
    },
  });
};
