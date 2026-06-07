import { useCallback } from 'react';
import { translate, TranslationKey } from '../constants/i18n';
import { useSettingsStore } from '../stores/settings.store';

export const useT = () => {
  const language = useSettingsStore((s) => s.language);

  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );
};
