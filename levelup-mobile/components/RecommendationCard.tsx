import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Recommendation } from '../types';
import { useT } from '../hooks/useT';
import {
  borderRadius,
  colors,
  spacing,
  typography,
} from '../constants/theme';

interface RecommendationCardProps {
  recommendations: Recommendation[];
}

export function RecommendationCard({
  recommendations,
}: RecommendationCardProps) {
  const t = useT();

  if (recommendations.length === 0) return null;

  const categoryName = (category: unknown): string => {
    switch (category) {
      case 'STUDY':
        return t('activity.study');
      case 'WORKOUT':
        return t('activity.workout');
      case 'HABIT':
        return t('activity.habit');
      default:
        return String(category ?? '');
    }
  };

  const recommendationText = (recommendation: Recommendation): string => {
    switch (recommendation.code) {
      case 'MAINTAIN_STREAK':
        return t('recommendations.maintainStreak', {
          streak: recommendation.metadata.streak,
        });
      case 'CATEGORY_UNDERREPRESENTED':
        return t('recommendations.categoryUnderrepresented', {
          category: categoryName(recommendation.metadata.category),
        });
      case 'LEVEL_ALMOST_REACHED':
        return t('recommendations.levelAlmostReached', {
          xp: recommendation.metadata.xpRemaining,
        });
      case 'PRODUCTIVITY_DECREASED':
        return t('recommendations.productivityDecreased');
      case 'CONSISTENCY':
        return t('recommendations.consistency', {
          streak: recommendation.metadata.streak,
        });
      case 'PRODUCTIVITY_IMPROVED':
        return t('recommendations.productivityImproved');
      case 'START_TODAY':
        return t('recommendations.startToday');
      default:
        return recommendation.message;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name="bulb-outline"
          size={20}
          color={colors.primary}
        />
        <Text style={styles.title}>{t('home.recommendations')}</Text>
      </View>
      {recommendations.map((recommendation) => (
        <View key={recommendation.id} style={styles.row}>
          <View style={styles.bullet} />
          <Text style={styles.text}>
            {recommendationText(recommendation)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  text: {
    ...typography.small,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
});
