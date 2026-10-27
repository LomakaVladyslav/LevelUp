import type { ComponentProps } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { typography } from '../constants/theme';

export const pageContent = { width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const, padding: 16, paddingBottom: 32 };

type ButtonProps = ComponentProps<typeof TouchableOpacity> & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};
export function ActionButton({ label, loading, disabled, variant = 'primary', style, ...props }: ButtonProps) {
  const { colors } = useTheme();
  const color = variant === 'primary' ? colors.textOnPrimary : variant === 'danger' ? colors.danger : colors.primary;
  return <TouchableOpacity {...props} accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} style={[styles.button, { backgroundColor: variant === 'primary' ? colors.primary : colors.surface, borderColor: variant === 'danger' ? colors.danger : variant === 'primary' ? colors.primary : colors.border, opacity: disabled || loading ? 0.6 : 1 }, style]}>
    {loading ? <ActivityIndicator color={color} /> : null}
    <Text style={[styles.buttonText, { color }]}>{label}</Text>
  </TouchableOpacity>;
}

export function EmptyState({ title, message, icon = 'checkbox-outline', action }: {
  title: string; message: string; icon?: ComponentProps<typeof Ionicons>['name']; action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return <View style={[styles.empty, { backgroundColor: colors.surface }]}>
    <Ionicons name={icon} size={32} color={colors.primary} accessible={false} />
    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
    <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
    {action ? <ActionButton label={action.label} onPress={action.onPress} style={{ alignSelf: 'stretch', marginTop: 16 }} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...typography.bodyBold, flexShrink: 1, textAlign: 'center' },
  empty: { padding: 24, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  emptyTitle: { ...typography.h3, textAlign: 'center', marginTop: 12 },
  emptyMessage: { ...typography.body, textAlign: 'center', marginTop: 8, lineHeight: 24 },
});
