import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Link } from 'expo-router';
import { authService } from '../../services/auth.service';
import { useAuthStore } from '../../stores/auth.store';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { getApiErrorMessage } from '../../utils/api-error';

type AccountFieldErrors = {
  email?: string;
  username?: string;
  password?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AccountFieldErrors>({});
  const [emailTouched, setEmailTouched] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState({
    email: false,
    username: false,
  });
  const [loading, setLoading] = useState(false);
  const emailCheckId = useRef(0);
  const usernameCheckId = useRef(0);
  const setAuth = useAuthStore((s) => s.setAuth);

  const setFieldError = useCallback(
    (field: keyof AccountFieldErrors, message?: string) => {
      setFieldErrors((current) => ({ ...current, [field]: message }));
    },
    [],
  );

  const getEmailError = useCallback(
    (value: string) => {
      if (!value.trim()) return t('auth.emailRequired');
      if (!EMAIL_REGEX.test(value.trim())) return t('auth.emailInvalid');
      return undefined;
    },
    [t],
  );

  const getUsernameError = useCallback(
    (value: string) =>
      value.trim() ? undefined : t('auth.usernameRequired'),
    [t],
  );

  const getPasswordError = useCallback(
    (value: string) => {
      if (!value) return t('auth.passwordRequired');
      if (value.length < 6) return t('register.passwordShort');
      return undefined;
    },
    [t],
  );

  const checkEmailAvailability = useCallback(
    async (value: string) => {
      const normalizedEmail = value.trim().toLowerCase();
      const localError = getEmailError(normalizedEmail);

      if (localError) {
        setFieldError('email', localError);
        return false;
      }

      const requestId = ++emailCheckId.current;
      setCheckingAvailability((current) => ({ ...current, email: true }));

      try {
        const result = await authService.availability({ email: normalizedEmail });
        if (requestId !== emailCheckId.current) return false;

        const message =
          result.emailAvailable === false ? t('auth.emailInUse') : undefined;
        setFieldError('email', message);
        return !message;
      } catch (error: any) {
        if (requestId === emailCheckId.current) {
          setFieldError(
            'email',
            getApiErrorMessage(error, t, 'common.somethingWrong'),
          );
        }
        return false;
      } finally {
        if (requestId === emailCheckId.current) {
          setCheckingAvailability((current) => ({ ...current, email: false }));
        }
      }
    },
    [getEmailError, setFieldError, t],
  );

  const checkUsernameAvailability = useCallback(
    async (value: string) => {
      const normalizedUsername = value.trim();
      const localError = getUsernameError(normalizedUsername);

      if (localError) {
        setFieldError('username', localError);
        return false;
      }

      const requestId = ++usernameCheckId.current;
      setCheckingAvailability((current) => ({ ...current, username: true }));

      try {
        const result = await authService.availability({
          username: normalizedUsername,
        });
        if (requestId !== usernameCheckId.current) return false;

        const message =
          result.usernameAvailable === false
            ? t('auth.usernameInUse')
            : undefined;
        setFieldError('username', message);
        return !message;
      } catch (error: any) {
        if (requestId === usernameCheckId.current) {
          setFieldError(
            'username',
            getApiErrorMessage(error, t, 'common.somethingWrong'),
          );
        }
        return false;
      } finally {
        if (requestId === usernameCheckId.current) {
          setCheckingAvailability((current) => ({
            ...current,
            username: false,
          }));
        }
      }
    },
    [getUsernameError, setFieldError, t],
  );

  useEffect(() => {
    if (!emailTouched) return undefined;

    const timer = setTimeout(() => {
      void checkEmailAvailability(email);
    }, 500);

    return () => clearTimeout(timer);
  }, [checkEmailAvailability, email, emailTouched]);

  useEffect(() => {
    if (!usernameTouched) return undefined;

    const timer = setTimeout(() => {
      void checkUsernameAvailability(username);
    }, 500);

    return () => clearTimeout(timer);
  }, [checkUsernameAvailability, username, usernameTouched]);

  const validateLocalAccountFields = () => {
    const errors = {
      email: getEmailError(email),
      username: getUsernameError(username),
      password: getPasswordError(password),
    };

    setFieldErrors(errors);
    return !errors.email && !errors.username && !errors.password;
  };

  const parsedAge = () => Number(age);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('image.permissionTitle'), t('image.permissionMessage'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleNext = async () => {
    setEmailTouched(true);
    setUsernameTouched(true);

    if (!validateLocalAccountFields()) return;

    const [emailAvailable, usernameAvailable] = await Promise.all([
      checkEmailAvailability(email),
      checkUsernameAvailability(username),
    ]);

    if (emailAvailable && usernameAvailable) {
      setStep(2);
    }
  };

  const handleRegister = async () => {
    const ageValue = parsedAge();
    if (!Number.isInteger(ageValue) || ageValue < 1 || ageValue > 120) {
      Alert.alert(t('common.error'), t('register.ageInvalid'));
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await authService.register(
        email.trim().toLowerCase(),
        username.trim(),
        password,
        ageValue,
        avatarUri,
      );
      await setAuth(token, user);
    } catch (error: any) {
      const errorCode = error?.response?.data?.errorCode;

      if (errorCode === 'AUTH_EMAIL_IN_USE') {
        setFieldError('email', t('auth.emailInUse'));
        setStep(1);
        return;
      }

      if (errorCode === 'AUTH_USERNAME_IN_USE') {
        setFieldError('username', t('auth.usernameInUse'));
        setStep(1);
        return;
      }

      Alert.alert(
        t('register.failed'),
        getApiErrorMessage(error, t, 'common.somethingWrong'),
      );
    } finally {
      setLoading(false);
    }
  };

  const accountStepComplete =
    Boolean(email.trim()) &&
    Boolean(username.trim()) &&
    password.length >= 6 &&
    EMAIL_REGEX.test(email.trim());
  const hasAccountErrors = Boolean(
    fieldErrors.email || fieldErrors.username || fieldErrors.password,
  );
  const availabilityPending =
    checkingAvailability.email || checkingAvailability.username;
  const nextDisabled =
    !accountStepComplete || hasAccountErrors || availabilityPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.inner}>
        {step === 1 ? (
          <>
            <Text style={styles.emoji}>⚔️</Text>
            <Text style={styles.title}>{t('register.title')}</Text>
            <Text style={styles.subtitle}>{t('register.subtitle')}</Text>

            <TextInput
              style={[styles.input, fieldErrors.email ? styles.inputError : null]}
              placeholder={t('auth.email')}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setFieldError('email');
              }}
              onBlur={() => setEmailTouched(true)}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            {checkingAvailability.email ? (
              <Text style={styles.fieldHintText}>
                {t('register.checkingAvailability')}
              </Text>
            ) : fieldErrors.email ? (
              <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>
            ) : null}

            <TextInput
              style={[
                styles.input,
                fieldErrors.username ? styles.inputError : null,
              ]}
              placeholder={t('register.username')}
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setFieldError('username');
              }}
              onBlur={() => setUsernameTouched(true)}
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            {checkingAvailability.username ? (
              <Text style={styles.fieldHintText}>
                {t('register.checkingAvailability')}
              </Text>
            ) : fieldErrors.username ? (
              <Text style={styles.fieldErrorText}>{fieldErrors.username}</Text>
            ) : null}

            <TextInput
              style={[
                styles.input,
                fieldErrors.password ? styles.inputError : null,
              ]}
              placeholder={t('register.passwordPlaceholder')}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFieldError('password', value ? getPasswordError(value) : undefined);
              }}
              secureTextEntry
              placeholderTextColor={colors.textMuted}
            />
            {fieldErrors.password ? (
              <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, nextDisabled && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={nextDisabled}
            >
              <Text style={styles.buttonText}>{t('common.next')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.emoji}>🧑</Text>
            <Text style={styles.title}>{t('register.profileTitle')}</Text>
            <Text style={styles.subtitle}>{t('register.profileSubtitle')}</Text>

            <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarPlaceholder}>+</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.avatarButton} onPress={pickAvatar}>
              <Text style={styles.avatarButtonText}>
                {avatarUri ? t('register.changeAvatar') : t('register.pickAvatar')}
              </Text>
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder={t('register.agePlaceholder')}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, loading && styles.buttonDisabled]}
                onPress={() => setStep(1)}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.flexButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleRegister}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? t('register.loading') : t('register.button')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Link href="/auth/login" style={styles.link}>
          {t('register.link')}
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emoji: { fontSize: 64, textAlign: 'center', marginBottom: spacing.sm },
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
  fieldErrorText: {
    ...typography.small,
    color: colors.danger,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldHintText: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  flexButton: { flex: 1 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textOnPrimary, ...typography.bodyBold },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    minWidth: 96,
  },
  secondaryButtonText: { ...typography.bodyBold, color: colors.textPrimary },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  avatarPicker: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 40, color: colors.primary },
  avatarButton: { alignSelf: 'center', marginBottom: spacing.lg },
  avatarButtonText: { ...typography.small, color: colors.primary },
  link: {
    marginTop: spacing.lg,
    textAlign: 'center',
    color: colors.primary,
    ...typography.small,
  },
  });
};
