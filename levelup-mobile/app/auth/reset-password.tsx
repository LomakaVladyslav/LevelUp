import { AuthFrame } from '../../components/AuthFrame';
import { ActionButton } from '../../components/ScreenUi';
import { useAuthStore } from '../../stores/auth.store';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { authService } from '../../services/auth.service';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';

export default function ResetPasswordScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const handleSubmit = async () => {
    if (pending.current) return;
    setError('');

    if (!token) {
      setError(t('resetPassword.invalidLink'));
      return;
    }

    if (password.length < 6) {
      setError(t('register.passwordShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }

    pending.current = true;
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      await useAuthStore.getState().logout();
      setSuccess(true);
    } catch (submitError: any) {
      setError(
        getApiErrorMessage(submitError, t, 'common.somethingWrong'),
      );
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthFrame>
        <Text style={styles.title}>{t('resetPassword.successTitle')}</Text>
        <Text style={styles.subtitle}>{t('resetPassword.successBody')}</Text>
        <ActionButton label={t('forgotPassword.backToLogin')} onPress={() => router.replace('/auth/login')} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
        <Text style={styles.title}>{t('resetPassword.title')}</Text>
        <Text style={styles.subtitle}>{t('resetPassword.subtitle')}</Text>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          accessibilityLabel={t('resetPassword.newPassword')}
          placeholder={t('resetPassword.newPassword')}
          editable={!loading}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError('');
          }}
          autoComplete="new-password" textContentType="newPassword"
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          accessibilityLabel={t('resetPassword.confirmPassword')}
          placeholder={t('resetPassword.confirmPassword')}
          editable={!loading}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setError('');
          }}
          autoComplete="new-password" textContentType="newPassword"
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />

        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}

        <ActionButton label={t(loading ? 'resetPassword.loading' : 'resetPassword.button')} loading={loading} onPress={handleSubmit} />

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
      marginBottom: spacing.md,
      ...typography.body,
      color: colors.textPrimary,
    },
    inputError: { borderColor: colors.danger },
    errorText: {
      ...typography.small,
      color: colors.danger,
      marginBottom: spacing.sm,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
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
