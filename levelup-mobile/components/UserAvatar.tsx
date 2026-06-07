import { Image, StyleSheet, Text, View } from 'react-native';
import { getAssetUrl } from '../services/api';
import { colors } from '../constants/theme';

interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  size?: number;
}

export function UserAvatar({ username, avatarUrl, size = 96 }: UserAvatarProps) {
  const source = getAssetUrl(avatarUrl);
  const radius = size / 2;

  if (source) {
    return (
      <Image
        source={{ uri: source }}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: radius },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {username?.[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: colors.surfaceSecondary },
  fallback: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: { color: '#fff', fontWeight: '700' },
});
