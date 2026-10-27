import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { authService } from '../../services/auth.service';
import { useAuthStore } from '../../stores/auth.store';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';
import { AuthFrame } from '../../components/AuthFrame';
import { ActionButton } from '../../components/ScreenUi';

type FieldErrors = { email?: string; username?: string; password?: string };
export default function RegisterScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const nameInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const handleRegister = async () => {
    if (pending.current) return;
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = t('auth.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = t('auth.emailInvalid');
    if (!username.trim()) errors.username = t('auth.usernameRequired');
    if (password.length < 6) errors.password = t('register.passwordShort');
    setFieldErrors(errors);
    setError('');
    if (Object.keys(errors).length) return;
    pending.current = true;
    setLoading(true);
    try {
      // The server checks uniqueness atomically. Optional profile fields remain
      // available in Settings, without an extra signup screen or preflight reads.
      const result = await authService.register(email.trim().toLowerCase(), username.trim(), password);
      if (mounted.current) await useAuthStore.getState().setAuth(result.token, result.user);
    } catch (failure: any) {
      if (!mounted.current) return;
      const code = failure.response?.data?.errorCode;
      if (code === 'AUTH_EMAIL_IN_USE') setFieldErrors({ email: t('auth.emailInUse') });
      else if (code === 'AUTH_USERNAME_IN_USE') setFieldErrors({ username: t('auth.usernameInUse') });
      else setError(getApiErrorMessage(failure, t, 'register.failed'));
    } finally { pending.current = false; if (mounted.current) setLoading(false); }
  };

  return <AuthFrame>
    <Text style={styles.title}>{t('register.title')}</Text>
    <Text style={styles.subtitle}>{t('register.subtitle')}</Text>
    <Text style={styles.label}>{t('auth.email')}</Text>
    <TextInput style={[styles.input, fieldErrors.email && styles.inputError]} value={email} placeholder={t('auth.email')}
      accessibilityLabel={t('auth.email')} editable={!loading} maxLength={254} keyboardType="email-address"
      autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next"
      onSubmitEditing={() => nameInput.current?.focus()} blurOnSubmit={false} placeholderTextColor={colors.textMuted}
      onChangeText={(value) => { setEmail(value); setFieldErrors((state) => ({ ...state, email: undefined })); setError(''); }} />
    {fieldErrors.email ? <Text accessibilityRole="alert" style={styles.error}>{fieldErrors.email}</Text> : null}
    <Text style={styles.label}>{t('register.username')}</Text>
    <TextInput ref={nameInput} style={[styles.input, fieldErrors.username && styles.inputError]} value={username} placeholder={t('register.username')}
      accessibilityLabel={t('register.username')} editable={!loading} maxLength={50} autoCapitalize="none" autoCorrect={false}
      autoComplete="username-new" textContentType="username" returnKeyType="next" blurOnSubmit={false}
      onSubmitEditing={() => passwordInput.current?.focus()} placeholderTextColor={colors.textMuted}
      onChangeText={(value) => { setUsername(value); setFieldErrors((state) => ({ ...state, username: undefined })); setError(''); }} />
    {fieldErrors.username ? <Text accessibilityRole="alert" style={styles.error}>{fieldErrors.username}</Text> : null}
    <Text style={styles.label}>{t('auth.password')}</Text>
    <TextInput ref={passwordInput} style={[styles.input, fieldErrors.password && styles.inputError]} value={password} placeholder={t('register.passwordPlaceholder')}
      accessibilityLabel={t('auth.password')} editable={!loading} secureTextEntry autoComplete="new-password" textContentType="newPassword"
      returnKeyType="go" onSubmitEditing={() => { void handleRegister(); }} placeholderTextColor={colors.textMuted}
      onChangeText={(value) => { setPassword(value); setFieldErrors((state) => ({ ...state, password: value && value.length < 6 ? t('register.passwordShort') : undefined })); setError(''); }} />
    {fieldErrors.password ? <Text accessibilityRole="alert" style={styles.error}>{fieldErrors.password}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <ActionButton label={t(loading ? 'register.loading' : 'register.button')} loading={loading} onPress={() => { void handleRegister(); }} style={{ marginTop: spacing.sm }} />
    <Link href="/auth/login" replace style={styles.link}>{t('register.link')}</Link>
  </AuthFrame>;
}
const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 24 },
  label: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.xs },
  input: { minHeight: 48, backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md, ...typography.body },
  inputError: { borderColor: colors.danger },
  error: { ...typography.small, color: colors.danger, marginBottom: spacing.md },
  link: { ...typography.body, color: colors.primary, textAlign: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
});
