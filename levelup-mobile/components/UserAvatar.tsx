import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { privateAvatarSource } from '../services/avatar';
import { useAuthStore } from '../stores/auth.store';
import { useTheme } from '../hooks/useTheme';

interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  size?: number;
}

export function UserAvatar({ username, avatarUrl, size = 96 }: UserAvatarProps) {
  const { colors } = useTheme();
  const token = useAuthStore((state) => state.token);
  const source = privateAvatarSource(avatarUrl, token);
  const radius = size / 2;
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (source && source.uri !== failedSource) {
    return (
      <Image
        testID="user-avatar"
        source={source}
        onError={() => setFailedSource(source.uri)}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: colors.surfaceSecondary,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.primary,
        },
      ]}
    >
      <Text
        // The initial is a fixed-size avatar graphic, not body text.
        allowFontScaling={false}
        style={[
          styles.initial,
          { color: colors.textOnPrimary, fontSize: size * 0.42 },
        ]}
      >
        {username?.[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {},
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: { fontWeight: '700' },
});
