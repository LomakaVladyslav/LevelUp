import { AI_FEATURES_ENABLED } from '../../constants/features';
import { useHeaderHeight } from '@react-navigation/elements';
import { Redirect, useRouter } from 'expo-router';
import { ActionButton, pageContent } from '../../components/ScreenUi';
import { apiContext } from '../../services/api-context';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { aiService, AiMessage } from '../../services/ai.service';
import { plannedActivityService } from '../../services/plannedActivity.service';
import { notificationService } from '../../services/notification.service';
import { AppTheme, spacing, borderRadius, typography } from '../../constants/theme';
import { useT } from '../../hooks/useT';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settings.store';
import { PlannedActivityScheduleType, SuggestedActivity } from '../../types';
import { getLocale } from '../../constants/i18n';
import { getApiErrorMessage } from '../../utils/api-error';

const getDeviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export default function AiScreen() {
  return AI_FEATURES_ENABLED ? <AiChatScreen /> : <Redirect href="/(tabs)/profile" />;
}

function AiChatScreen() {
  const t = useT();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const language = useSettingsStore((s) => s.language);
  const listRef = useRef<FlatList<AiMessage>>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const sendingRef = useRef(false);
  const addingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({});
  const [addedSuggestionMessages, setAddedSuggestionMessages] = useState<Record<string, boolean>>({});
  const [addingSuggestionsKey, setAddingSuggestionsKey] = useState<string | null>(null);

  const suggestionKey = (messageIndex: number, suggestionIndex: number) =>
    `${messageIndex}:${suggestionIndex}`;

  const scheduleLabel = (type: PlannedActivityScheduleType) => {
    switch (type) {
      case 'SIMPLE':
        return t('activities.scheduleSimple');
      case 'DAILY':
        return t('activities.scheduleDaily');
      case 'DATE':
        return t('activities.scheduleDate');
    }
  };

  const formatTime = (minutes?: number | null) => {
    if (minutes == null) return null;

    const date = new Date();
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return date.toLocaleTimeString(getLocale(language), { hour: '2-digit', minute: '2-digit' });
  };

  const suggestionMeta = (suggestion: SuggestedActivity) => {
    const parts = [scheduleLabel(suggestion.scheduleType)];
    if (suggestion.dueDate) parts.push(suggestion.dueDate);

    const time = formatTime(suggestion.dueTimeMinutes);
    if (time) parts.push(time);

    return parts.join(' • ');
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    const session = apiContext.get().sessionVersion;

    const nextMessages: AiMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const reply = await aiService.chat(nextMessages, getDeviceTimezone());
      if (session !== apiContext.get().sessionVersion) return;
      const replyIndex = nextMessages.length;
      if (reply.suggestedActivities?.length) {
        setSelectedSuggestions((current) => {
          const next = { ...current };
          reply.suggestedActivities?.forEach((_, suggestionIndex) => {
            next[suggestionKey(replyIndex, suggestionIndex)] = true;
          });
          return next;
        });
      }

      setMessages([...nextMessages, reply]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (error: any) {
      if (session !== apiContext.get().sessionVersion) return;
      setMessages(messages);
      setInput(content);
      Alert.alert(
        t('ai.failed'),
        getApiErrorMessage(error, t, 'ai.failed'),
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleAddSuggestions = async (message: AiMessage, messageIndex: number) => {
    if (addingRef.current || addedSuggestionMessages[messageIndex]) return;
    const session = apiContext.get().sessionVersion;
    const suggestions = message.suggestedActivities ?? [];
    const selected = suggestions.filter((_, suggestionIndex) =>
      selectedSuggestions[suggestionKey(messageIndex, suggestionIndex)]
    );

    if (selected.length === 0) {
      Alert.alert(t('common.error'), t('ai.noSuggestionsSelected'));
      return;
    }

    addingRef.current = true;
    setAddingSuggestionsKey(String(messageIndex));
    try {
      const timezone = getDeviceTimezone();
      const result = await plannedActivityService.bulkCreate(
        selected.map((suggestion) => ({ ...suggestion, timezone })),
      );

      if (session !== apiContext.get().sessionVersion) return;
      setAddedSuggestionMessages((current) => ({ ...current, [messageIndex]: true }));
      // Committed tasks are usable immediately; OS reminder work is independent.
      void Promise.all(result.plannedActivities.map((activity) => notificationService.scheduleActivityReminder(activity, language))).catch(() => {
        if (session === apiContext.get().sessionVersion) Alert.alert(t('common.error'), t('notifications.permissionDenied'));
      });
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        getApiErrorMessage(error, t, 'common.somethingWrong'),
      );
    } finally {
      addingRef.current = false;
      setAddingSuggestionsKey(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        keyboardShouldPersistTaps="handled"
        ref={listRef}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={[
          styles.list,
          messages.length === 0 && styles.emptyList,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyBubble}>
            <Text style={styles.emptyText}>{t('ai.welcome')}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.messageBubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.role === 'user' && styles.userMessageText,
              ]}
            >
              {item.content}
            </Text>

            {item.role === 'assistant' && item.suggestedActivities?.length ? (
              <View style={styles.suggestions}>
                {item.suggestedActivities.map((suggestion, suggestionIndex) => {
                  const key = suggestionKey(index, suggestionIndex);
                  const selected = selectedSuggestions[key];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.suggestionCard,
                        selected && styles.suggestionCardSelected,
                      ]}
                      disabled={Boolean(addedSuggestionMessages[index]) || addingSuggestionsKey !== null}
                      onPress={() => {
                        setSelectedSuggestions((current) => ({
                          ...current,
                          [key]: !current[key],
                        }));
                      }}
                    >
                      <View style={styles.suggestionHeader}>
                        <View style={[
                          styles.checkbox,
                          selected && styles.checkboxSelected,
                        ]}>
                          {selected ? <Text style={styles.checkboxText}>✓</Text> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                          <Text style={styles.suggestionMeta}>{suggestionMeta(suggestion)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  accessibilityRole="button"
                  style={[
                    styles.addSuggestionsButton,
                    (addingSuggestionsKey === String(index) || addedSuggestionMessages[index]) &&
                      styles.addSuggestionsButtonDisabled,
                  ]}
                  disabled={addingSuggestionsKey !== null || addedSuggestionMessages[index]}
                  onPress={() => handleAddSuggestions(item, index)}
                >
                  {addingSuggestionsKey === String(index) ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : (
                    <Text style={styles.addSuggestionsText}>
                      {addedSuggestionMessages[index] ? t('ai.added') : t('ai.addSelected')}
                    </Text>
                  )}
                </TouchableOpacity>
                {addedSuggestionMessages[index] ? <ActionButton label={t('home.allTasks')} variant="secondary" onPress={() => router.navigate('/(tabs)/activities')} style={{ marginTop: 8 }} /> : null}
              </View>
            ) : null}
          </View>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel={t('ai.placeholder')}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('ai.placeholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={4000}
          editable={!sending}
          multiline
        />
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.sendText}>{t('ai.send')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) => {
  const { colors } = theme;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { ...pageContent, gap: spacing.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyBubble: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  messageText: { ...typography.body, color: colors.textPrimary },
  userMessageText: { color: colors.textOnPrimary },
  suggestions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  suggestionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  suggestionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  suggestionHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxText: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
  suggestionTitle: { ...typography.small, color: colors.textPrimary, fontWeight: '600' },
  suggestionMeta: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  addSuggestionsButton: {
    minHeight: 42,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  addSuggestionsButtonDisabled: { opacity: 0.65 },
  addSuggestionsText: { ...typography.small, color: colors.textOnPrimary, fontWeight: '600' },
  composer: {
    width: '100%', maxWidth: 720, alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  sendButton: {
    minWidth: 72,
    minHeight: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sendButtonDisabled: { opacity: 0.6 },
  sendText: { ...typography.bodyBold, color: colors.textOnPrimary },
  });
};
