import { Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../hooks/useT';
import { useTheme } from '../hooks/useTheme';
import { getApiErrorMessage } from '../utils/api-error';

export function ResourceError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  if (!error) return null;
  return <View accessibilityRole="alert" style={{ padding: 16, marginBottom: 12, borderRadius: 12, backgroundColor: colors.surface, borderColor: colors.danger, borderWidth: 1 }}>
    <Text style={{ color: colors.textPrimary, marginBottom: 8 }}>{getApiErrorMessage(error, t, 'common.loadFailed')}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={retry} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('common.retry')}</Text>
    </TouchableOpacity>
  </View>;
}
