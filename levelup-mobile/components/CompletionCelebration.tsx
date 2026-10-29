import { UndoCompletionButton } from './UndoCompletionButton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  useWindowDimensions,
  View,
  Text,
} from 'react-native';
import Animated, {
  clamp,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useT } from '../hooks/useT';
import { AppTheme } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export type CompletionCelebrationVariant =
  | 'completed'
  | 'levelUp'
  | 'achievement';

export type CompletionCelebrationData = {
  activityId?: string;
  variant: CompletionCelebrationVariant;
  xpGained?: number;
  newLevel?: number;
};

type CompletionCelebrationProps = {
  visible: boolean;
  data: CompletionCelebrationData | null;
  onDismiss: () => void;
  autoDismissMs?: number;
};

type ParticleSpec = {
  id: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
  travelX: number;
  lift: number;
  drop: number;
  rotation: number;
  delayProgress: number;
};

const PARTICLE_COUNT = 48;
const DEFAULT_AUTO_DISMISS_MS = 8000;

const createParticles = (
  colors: AppTheme['colors'],
  activityColor: AppTheme['activityColor'],
  width: number,
  height: number,
): ParticleSpec[] => {
  const palette = [
    colors.success,
    colors.primary,
    colors.xpGold,
    colors.streakFire,
    activityColor.STUDY,
    activityColor.WORKOUT,
    activityColor.HABIT,
    activityColor.CUSTOM,
  ];
  const safeWidth = Math.max(width, 320);
  const safeHeight = Math.max(height, 560);

  return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const isLeft = index % 2 === 0;
    const isSpark = index % 5 === 0;
    const sideOffset = isLeft ? -28 : safeWidth + 28;
    const travelBase = 0.36 + ((index * 11) % 42) / 100;
    const size = isSpark ? 7 + (index % 3) : 8 + (index % 5);
    const stripWidth = isSpark ? size : size + 4 + (index % 4);
    const stripHeight = isSpark ? size : 10 + ((index * 3) % 12);

    return {
      id: `${isLeft ? 'left' : 'right'}-${index}`,
      color: palette[index % palette.length],
      left: sideOffset,
      top: safeHeight * (0.15 + ((index * 17) % 58) / 100),
      width: stripWidth,
      height: stripHeight,
      borderRadius: isSpark ? size : 2,
      travelX: safeWidth * travelBase * (isLeft ? 1 : -1),
      lift: 44 + ((index * 13) % 96),
      drop: 28 + ((index * 19) % 76),
      rotation: (isLeft ? 1 : -1) * (150 + ((index * 23) % 260)),
      delayProgress: ((index * 7) % 24) / 100,
    };
  });
};

function CelebrationParticle({
  particle,
  progress,
}: {
  particle: ParticleSpec;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const delayedProgress = clamp(
      (progress.value - particle.delayProgress) /
        (1 - particle.delayProgress),
      0,
      1,
    );
    const arc = -Math.sin(delayedProgress * Math.PI) * particle.lift;
    const translateY = arc + particle.drop * delayedProgress;
    const fadeOut = clamp((delayedProgress - 0.72) / 0.28, 0, 1);

    return {
      opacity: delayedProgress === 0 ? 0 : 1 - fadeOut,
      transform: [
        { translateX: particle.travelX * delayedProgress },
        { translateY },
        { rotate: `${particle.rotation * delayedProgress}deg` },
        { scale: 0.72 + delayedProgress * 0.38 },
      ] as const,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          backgroundColor: particle.color,
          borderRadius: particle.borderRadius,
          height: particle.height,
          left: particle.left,
          top: particle.top,
          width: particle.width,
        },
        animatedStyle,
      ]}
    />
  );
}

export function CompletionCelebration({
  visible,
  data,
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}: CompletionCelebrationProps) {
  const theme = useTheme();
  const t = useT();
  const { colors, activityColor } = theme;
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);

  const particles = useMemo(
    () => createParticles(colors, activityColor, width, height),
    [activityColor, colors, height, width],
  );

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible || !data) {
      progress.value = 0;
      return undefined;
    }

    dismissedRef.current = false;
    progress.value = reduceMotion
      ? 1
      : withTiming(1, {
          duration: 1550,
          easing: Easing.out(Easing.cubic),
        });
    timerRef.current = setTimeout(dismiss, autoDismissMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoDismissMs, data, dismiss, progress, reduceMotion, visible]);

  if (!visible || !data) return null;

  return (
    <View
      pointerEvents="box-none"
      style={styles.celebrationLayer}
      testID="completion-celebration"
    >
      <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 24, right: 24, top: 24, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderColor: colors.successBorder, borderWidth: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', textAlign: 'center' }}>{t('activities.completedTitle')}</Text>
        {data.xpGained !== undefined ? <Text style={{ color: colors.xpText, textAlign: 'center', marginTop: 4 }}>+{data.xpGained} XP{data.variant === 'levelUp' && data.newLevel ? ` · ${t('home.level')} ${data.newLevel}` : ''}</Text> : null}
        {data.activityId ? <UndoCompletionButton activityId={data.activityId} onDone={dismiss} /> : null}
      </View>
      {!reduceMotion
        ? particles.map((particle) => (
            <CelebrationParticle
              key={particle.id}
              particle={particle}
              progress={progress}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  celebrationLayer: {
    ...StyleSheet.absoluteFillObject,
    elevation: 20,
    overflow: 'hidden',
    zIndex: 20,
  },
  particle: {
    position: 'absolute',
  },
});
