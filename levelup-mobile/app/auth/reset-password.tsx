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

  const handleSubmit = async () => {
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

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (submitError: any) {
      setError(
        getApiErrorMessage(submitError, t, 'common.somethingWrong'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.title}>{t('resetPassword.successTitle')}</Text>
          <Text style={styles.subtitle}>{t('resetPassword.successBody')}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/auth/login')}
          >
            <Text style={styles.buttonText}>{t('forgotPassword.backToLogin')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>{t('resetPassword.title')}</Text>
        <Text style={styles.subtitle}>{t('resetPassword.subtitle')}</Text>

        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder={t('resetPassword.newPassword')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError('');
          }}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder={t('resetPassword.confirmPassword')}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setError('');
          }}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? t('resetPassword.loading') : t('resetPassword.button')}
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
      marginTop: spacing.lg,
      textAlign: 'center',
      color: colors.primary,
      ...typography.small,
    },
  });
};
