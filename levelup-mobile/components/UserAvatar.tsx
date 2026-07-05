import { Image, StyleSheet, Text, View } from 'react-native';
import { getAssetUrl } from '../services/api';
import { useTheme } from '../hooks/useTheme';

interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  size?: number;
}

export function UserAvatar({ username, avatarUrl, size = 96 }: UserAvatarProps) {
  const { colors } = useTheme();
  const source = getAssetUrl(avatarUrl);
  const radius = size / 2;

  if (source) {
    return (
      <Image
        source={{ uri: source }}
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
