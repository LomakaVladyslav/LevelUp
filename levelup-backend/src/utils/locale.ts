import { Request } from 'express';

export const SUPPORTED_LOCALES = [
  'en',
  'uk',
  'es',
  'pt-BR',
  'de',
  'fr',
  'it',
  'pl',
  'tr',
  'ja',
  'ko',
  'id',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const localeNames: Record<SupportedLocale, string> = {
  en: 'English',
  uk: 'Ukrainian',
  es: 'Spanish',
  'pt-BR': 'Brazilian Portuguese',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  pl: 'Polish',
  tr: 'Turkish',
  ja: 'Japanese',
  ko: 'Korean',
  id: 'Indonesian',
};

const localeByLanguage: Record<string, SupportedLocale> = {
  en: 'en',
  uk: 'uk',
  es: 'es',
  pt: 'pt-BR',
  de: 'de',
  fr: 'fr',
  it: 'it',
  pl: 'pl',
  tr: 'tr',
  ja: 'ja',
  ko: 'ko',
  id: 'id',
};

export const normalizeLocale = (value: unknown): SupportedLocale => {
  if (typeof value !== 'string') return 'en';

  const candidates = value
    .toLowerCase()
    .split(',')
    .map((part) => part.trim().split(';')[0].trim());

  for (const candidate of candidates) {
    const language = candidate.split('-')[0];
    const locale = localeByLanguage[language];
    if (locale) return locale;
  }

  return 'en';
};

export const getRequestLocale = (req: Request): SupportedLocale =>
  normalizeLocale(req.headers['accept-language']);
