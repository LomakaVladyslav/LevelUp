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
import { useAuthStore } from '../../stores/auth.store';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';

export default function LoginScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const passwordInput = useRef<TextInput>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (pending.current) return;
    setAuthError('');

    if (!email || !password) {
      setAuthError(t('auth.fillAll'));
      return;
    }

    pending.current = true;
    setLoading(true);
    try {
      const { token, user } = await authService.login(email.trim().toLowerCase(), password);
      if (mounted.current) await setAuth(token, user);
      // Navigation is handled automatically by _layout.tsx
    } catch (error: any) {
      setAuthError(
        getApiErrorMessage(error, t, 'common.somethingWrong'),
      );
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <AuthFrame>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

        <TextInput
          style={styles.input}
          accessibilityLabel={t('auth.email')}
          maxLength={254}
          returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => passwordInput.current?.focus()}
          placeholder={t('auth.email')}
          editable={!loading}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setAuthError('');
          }}
          keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={styles.input}
          ref={passwordInput}
          accessibilityLabel={t('auth.password')}
          autoComplete="current-password" textContentType="password"
          placeholder={t('auth.password')}
          editable={!loading}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setAuthError('');
          }}
          returnKeyType="go" onSubmitEditing={() => { void handleLogin(); }}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />

        {authError ? <Text accessibilityRole="alert" style={styles.errorText}>{authError}</Text> : null}

        <Link href="/auth/forgot-password" style={styles.forgotLink}>
          {t('login.forgotPassword')}
        </Link>

        <ActionButton label={t(loading ? 'login.loading' : 'login.button')} loading={loading} onPress={handleLogin} />

        <Link replace href="/auth/register" style={styles.link}>
          {t('login.link')}
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
  emoji: { fontSize: 64, textAlign: 'center', marginBottom: spacing.sm },
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
  errorText: {
    ...typography.small,
    color: colors.danger,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  forgotLink: {
    paddingVertical: 12,
    marginBottom: spacing.sm,
    textAlign: 'right',
    color: colors.primary,
    ...typography.small,
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
