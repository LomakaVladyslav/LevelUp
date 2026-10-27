import { AuthFrame } from '../../components/AuthFrame';
import { ActionButton } from '../../components/ScreenUi';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
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
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const handleSubmit = async () => {
    if (pending.current) return;
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }

    pending.current = true;
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setMessage(t('forgotPassword.success'));
    } catch (submitError: any) {
      setError(
        getApiErrorMessage(submitError, t, 'common.somethingWrong'),
      );
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <AuthFrame>
        <Text style={styles.title}>{t('forgotPassword.title')}</Text>
        <Text style={styles.subtitle}>{t('forgotPassword.subtitle')}</Text>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          accessibilityLabel={t('auth.email')}
          maxLength={254}
          returnKeyType="send" onSubmitEditing={() => { void handleSubmit(); }}
          placeholder={t('auth.email')}
          editable={!loading}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError('');
            setMessage('');
          }}
          keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
          placeholderTextColor={colors.textMuted}
        />

        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}

        <ActionButton label={t(loading ? 'forgotPassword.loading' : 'forgotPassword.button')} loading={loading} onPress={handleSubmit} style={{ marginTop: spacing.md }} />

        <Link replace href="/auth/login" style={styles.link}>
          {t('forgotPassword.backToLogin')}
        </Link>
    </AuthFrame>
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
      textAlign: 'left',
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.small,
      textAlign: 'left',
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
      color: colors.successText,
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
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    textAlign: 'center',
    color: colors.primary,
    ...typography.body,
    },
  });
};
