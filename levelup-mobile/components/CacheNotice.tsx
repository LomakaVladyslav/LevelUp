import { Text } from 'react-native';
import { useT } from '../hooks/useT';
import { useTheme } from '../hooks/useTheme';
export function CacheNotice({ cached, savedAt, error }: { cached: boolean; savedAt: number | null; error?: unknown }) {
  const t = useT();
  const { colors } = useTheme();
  if (!cached) return null;
  return <Text accessibilityRole="alert" style={{ color: colors.textSecondary, marginBottom: 12, lineHeight: 22 }}>
    {t(error && !(error as { response?: unknown }).response ? 'daily.offline' : 'daily.cached')}{savedAt ? ` · ${new Date(savedAt).toLocaleString()}` : ''}
  </Text>;
}
