import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { LanguageSelector } from './LanguageSelector';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// One scrollable, bounded form works with large text, small phones and keyboards.
export function AuthFrame({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: Math.max(24, insets.top), paddingBottom: Math.max(24, insets.bottom) }]}>
      <LanguageSelector inline />
      {children}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 48, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
