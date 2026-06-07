import { useState } from 'react';
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
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';

export default function RegisterScreen() {
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const validateAccountStep = () => {
    if (!email || !username || !password) {
      Alert.alert(t('common.error'), t('auth.fillAll'));
      return false;
    }

    if (password.length < 6) {
      Alert.alert(t('common.error'), t('register.passwordShort'));
      return false;
    }

    return true;
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

  const handleNext = () => {
    if (validateAccountStep()) {
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
        email,
        username,
        password,
        ageValue,
        avatarUri,
      );
      await setAuth(token, user);
    } catch (error: any) {
      Alert.alert(
        t('register.failed'),
        error.response?.data?.error || t('common.somethingWrong'),
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
      <ScrollView contentContainerStyle={styles.inner}>
        {step === 1 ? (
          <>
            <Text style={styles.emoji}>⚔️</Text>
            <Text style={styles.title}>{t('register.title')}</Text>
            <Text style={styles.subtitle}>{t('register.subtitle')}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              placeholder={t('register.username')}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              placeholder={t('register.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity style={styles.button} onPress={handleNext}>
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
                style={[styles.button, styles.flexButton, loading && styles.buttonDisabled]}
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

const styles = StyleSheet.create({
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
