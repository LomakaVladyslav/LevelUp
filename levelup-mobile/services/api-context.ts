import type { Language } from '../constants/i18n';

let token: string | null = null;
let userId: string | null = null;
let language: Language = 'en';
let sessionVersion = 0;
let onExpired: (() => void) | undefined;

export const apiContext = {
  get: () => ({ token, userId, language, sessionVersion }),
  setToken: (next: string | null, owner: string | null = null) => { token = next; userId = next ? owner : null; sessionVersion += 1; },
  setLanguage: (next: Language) => { language = next; },
  onSessionExpired: (handler: () => void) => { onExpired = handler; },
  expire: (requestToken: string | undefined) => {
    if (token && requestToken === `Bearer ${token}`) onExpired?.();
  },
};

export const getDeviceTimezone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
};
