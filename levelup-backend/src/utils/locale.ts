import { Request } from 'express';

export type SupportedLocale = 'en' | 'uk';

export const normalizeLocale = (value: unknown): SupportedLocale => {
  if (typeof value !== 'string') return 'en';

  const candidates = value
    .toLowerCase()
    .split(',')
    .map((part) => part.trim().split(';')[0].trim());

  for (const candidate of candidates) {
    if (candidate === 'uk' || candidate.startsWith('uk-')) return 'uk';
    if (candidate === 'en' || candidate.startsWith('en-')) return 'en';
  }

  return 'en';
};

export const getRequestLocale = (req: Request): SupportedLocale =>
  normalizeLocale(req.headers['accept-language']);
