import type { en } from './en';

export type TranslationDictionary = Record<keyof typeof en, string>;
