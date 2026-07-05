import {
  de,
  en,
  es,
  fr,
  id,
  it,
  ja,
  ko,
  pl,
  ptBR,
  tr,
  uk,
} from './locales';
import type { TranslationDictionary } from './locales/types';

export const languages = [
  { code: 'en', flag: '🇺🇸', name: 'English', locale: 'en-US' },
  { code: 'uk', flag: '🇺🇦', name: 'Українська', locale: 'uk-UA' },
  { code: 'es', flag: '🇪🇸', name: 'Español', locale: 'es-ES' },
  { code: 'pt-BR', flag: '🇧🇷', name: 'Português (Brasil)', locale: 'pt-BR' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch', locale: 'de-DE' },
  { code: 'fr', flag: '🇫🇷', name: 'Français', locale: 'fr-FR' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano', locale: 'it-IT' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski', locale: 'pl-PL' },
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe', locale: 'tr-TR' },
  { code: 'ja', flag: '🇯🇵', name: '日本語', locale: 'ja-JP' },
  { code: 'ko', flag: '🇰🇷', name: '한국어', locale: 'ko-KR' },
  { code: 'id', flag: '🇮🇩', name: 'Bahasa Indonesia', locale: 'id-ID' },
] as const;

export type Language = (typeof languages)[number]['code'];
export type TranslationKey = keyof typeof en;
export type { TranslationDictionary } from './locales/types';

export const translations: Record<Language, TranslationDictionary> = {
  en,
  uk,
  es,
  'pt-BR': ptBR,
  de,
  fr,
  it,
  pl,
  tr,
  ja,
  ko,
  id,
};

const languageCodes = new Set<string>(languages.map(({ code }) => code));

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && languageCodes.has(value);

export const getLanguage = (language: Language) =>
  languages.find(({ code }) => code === language) ?? languages[0];

export const getLocale = (language: Language): string =>
  getLanguage(language).locale;

export const getPluralKey = (
  language: Language,
  count: number,
  keys: {
    one: TranslationKey;
    few?: TranslationKey;
    many?: TranslationKey;
    other: TranslationKey;
  },
): TranslationKey => {
  const integer = Math.abs(Math.trunc(count));
  const lastDigit = integer % 10;
  const lastTwoDigits = integer % 100;
  let category: 'one' | 'few' | 'many' | 'other';

  if (language === 'uk') {
    if (lastDigit === 1 && lastTwoDigits !== 11) {
      category = 'one';
    } else if (
      lastDigit >= 2 &&
      lastDigit <= 4 &&
      (lastTwoDigits < 12 || lastTwoDigits > 14)
    ) {
      category = 'few';
    } else {
      category = 'many';
    }
  } else if (language === 'pl') {
    if (integer === 1) {
      category = 'one';
    } else if (
      lastDigit >= 2 &&
      lastDigit <= 4 &&
      (lastTwoDigits < 12 || lastTwoDigits > 14)
    ) {
      category = 'few';
    } else {
      category = 'many';
    }
  } else if (language === 'fr') {
    category = integer === 0 || integer === 1 ? 'one' : 'other';
  } else if (['ja', 'ko', 'id', 'tr'].includes(language)) {
    category = 'other';
  } else {
    category = integer === 1 ? 'one' : 'other';
  }

  if (category === 'one') return keys.one;
  if (category === 'few' && keys.few) return keys.few;
  if (category === 'many' && keys.many) return keys.many;
  return keys.other;
};

export const translate = (
  language: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string => {
  let value = translations[language]?.[key] ?? en[key] ?? key;

  if (params) {
    for (const [param, replacement] of Object.entries(params)) {
      value = value.split(`{{${param}}}`).join(String(replacement));
    }
  }

  return value;
};
