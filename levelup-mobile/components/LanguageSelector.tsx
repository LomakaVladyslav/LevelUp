import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getLanguage,
  languages,
  Language,
} from '../constants/i18n';
import {
  AppTheme,
  borderRadius,
  spacing,
  typography,
} from '../constants/theme';
import { useT } from '../hooks/useT';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../stores/settings.store';

export function LanguageSelector({ inline = false }: { inline?: boolean }) {
  const t = useT();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const [visible, setVisible] = useState(false);
  const currentLanguage = getLanguage(language);

  const selectLanguage = (nextLanguage: Language) => {
    setVisible(false);
    if (nextLanguage !== language) {
      void setLanguage(nextLanguage).catch(() => Alert.alert(t('common.error'), t('common.somethingWrong')));
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.headerButton, inline && styles.inlineButton]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={t('common.language')}
        accessibilityValue={{ text: currentLanguage.name }}
      >
        <Text style={styles.headerFlag}>{currentLanguage.flag}</Text>
        {inline ? <Text style={{ color: colors.textPrimary, ...typography.body }}>{currentLanguage.name}</Text> : null}
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.title}>{t('common.selectLanguage')}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.languageList}
              showsVerticalScrollIndicator={false}
            >
              {languages.map((option) => {
                const selected = option.code === language;

                return (
                  <TouchableOpacity
                    key={option.code}
                    style={[
                      styles.languageRow,
                      selected && styles.selectedLanguageRow,
                    ]}
                    onPress={() => selectLanguage(option.code)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text style={styles.flag}>{option.flag}</Text>
                    <Text style={styles.languageName}>{option.name}</Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.primary}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  inlineButton: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  headerFlag: {
    fontSize: 24,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  sheetHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h3,
    flex: 1,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageList: {
    padding: spacing.sm,
  },
  languageRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  selectedLanguageRow: {
    backgroundColor: colors.primaryLight,
  },
  flag: {
    width: 38,
    fontSize: 23,
  },
  languageName: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
  },
  });
};
