import { TranslationKey } from '../constants/i18n';

type Translator = (key: TranslationKey) => string;

const errorCodeKeys: Record<string, TranslationKey> = {
  ACTIVITY_CHANGED: 'activities.changed',
  ACTIVITY_ALREADY_COMPLETED: 'activities.alreadyCompleted',
  RATE_LIMITED: 'common.tryLater',
  SERVICE_UNAVAILABLE: 'common.loadFailed',
  AUTH_SESSION_EXPIRED: 'auth.invalidCredentials',
  AUTH_EMAIL_USERNAME_REQUIRED: 'auth.emailUsernameRequired',
  AUTH_EMAIL_PASSWORD_REQUIRED: 'auth.emailPasswordRequired',
  AUTH_EMAIL_REQUIRED: 'auth.emailRequired',
  AUTH_EMAIL_INVALID: 'auth.emailInvalid',
  AUTH_AVAILABILITY_REQUIRED: 'auth.availabilityRequired',
  AUTH_INVALID_CREDENTIALS: 'auth.invalidCredentials',
  AUTH_ACCOUNT_EXISTS: 'auth.accountExists',
  AUTH_EMAIL_IN_USE: 'auth.emailInUse',
  AUTH_USERNAME_IN_USE: 'auth.usernameInUse',
  AUTH_PASSWORD_SHORT: 'register.passwordShort',
  AUTH_AGE_INVALID: 'register.ageInvalid',
  AUTH_RESET_TOKEN_PASSWORD_REQUIRED: 'resetPassword.tokenPasswordRequired',
  AUTH_RESET_TOKEN_INVALID: 'resetPassword.invalidToken',
  AUTH_RESET_TOKEN_EXPIRED: 'resetPassword.expiredToken',
  AUTH_RESET_EMAIL_FAILED: 'forgotPassword.emailFailed',
  AI_NOT_CONFIGURED: 'ai.unavailable',
  AI_MESSAGES_REQUIRED: 'ai.messagesRequired',
  AI_MESSAGES_INVALID: 'ai.invalidMessages',
  AI_EMPTY_RESPONSE: 'ai.emptyResponse',
  AI_CHAT_FAILED: 'ai.failed',
};

const legacyMessageKeys: Record<string, TranslationKey> = {
  'Email, username and password are required': 'auth.emailUsernameRequired',
  'Email and password are required': 'auth.emailPasswordRequired',
  'Email is required': 'auth.emailRequired',
  'Email is invalid': 'auth.emailInvalid',
  'Email or username is required': 'auth.availabilityRequired',
  'Invalid email or password': 'auth.invalidCredentials',
  'Email or username already in use': 'auth.accountExists',
  'Email is already in use': 'auth.emailInUse',
  'Username is already in use': 'auth.usernameInUse',
  'Password must be at least 6 characters': 'register.passwordShort',
  'Age must be a whole number between 1 and 120': 'register.ageInvalid',
  'Token and password are required': 'resetPassword.tokenPasswordRequired',
  'Password reset token is invalid': 'resetPassword.invalidToken',
  'Password reset token has expired': 'resetPassword.expiredToken',
  'Messages are required': 'ai.messagesRequired',
  'Messages must include role and content': 'ai.invalidMessages',
  'AI returned an empty response': 'ai.emptyResponse',
  'AI chat failed': 'ai.failed',
};

export const getApiErrorMessage = (
  error: any,
  t: Translator,
  fallbackKey: TranslationKey,
): string => {
  const errorCode = error?.response?.data?.errorCode;
  const message = error?.response?.data?.error;
  const translationKey =
    (typeof errorCode === 'string' ? errorCodeKeys[errorCode] : undefined) ??
    (typeof message === 'string' ? legacyMessageKeys[message] : undefined);

  if (translationKey) return t(translationKey);
  if (!error?.response && ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return t('common.networkError');
  if (error?.response?.status >= 500) return t(fallbackKey);
  return typeof message === 'string' && message.trim()
    ? message
    : t(fallbackKey);
};
