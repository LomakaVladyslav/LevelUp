import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { authService } from '../../services/auth.service';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';

export default function ForgotPasswordScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }

    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setMessage(t('forgotPassword.success'));
    } catch (submitError: any) {
      setError(
        getApiErrorMessage(submitError, t, 'common.somethingWrong'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>{t('forgotPassword.title')}</Text>
        <Text style={styles.subtitle}>{t('forgotPassword.subtitle')}</Text>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder={t('auth.email')}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError('');
            setMessage('');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={colors.textMuted}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? t('forgotPassword.loading') : t('forgotPassword.button')}
          </Text>
        </TouchableOpacity>

        <Link href="/auth/login" style={styles.link}>
          {t('forgotPassword.backToLogin')}
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    inner: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    title: {
      ...typography.h1,
      textAlign: 'center',
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.small,
      textAlign: 'center',
      color: colors.textSecondary,
      marginBottom: spacing.xl,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      ...typography.body,
      color: colors.textPrimary,
    },
    inputError: { borderColor: colors.danger },
    errorText: {
      ...typography.small,
      color: colors.danger,
      marginTop: spacing.sm,
    },
    successText: {
      ...typography.small,
      color: colors.success,
      marginTop: spacing.sm,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: {
      color: colors.textOnPrimary,
      ...typography.bodyBold,
    },
    link: {
      marginTop: spacing.lg,
      textAlign: 'center',
      color: colors.primary,
      ...typography.small,
    },
  });
};
