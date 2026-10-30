import { getApiErrorMessage } from '../utils/api-error';
import { translate } from '../constants/i18n';
const t = (key: Parameters<typeof translate>[1]) => translate('en', key);
test('unknown HTTP messages never expose backend or database details', () => {
  for (const status of [400, 404, 500, 503]) {
    const message = getApiErrorMessage({ response: { status, data: { error: 'SQL internal private detail' } } }, t, 'common.loadFailed');
    expect(message).toBe(t('common.loadFailed'));
    expect(message).not.toContain('SQL');
  }
});
test('known conflict errors stay actionable and network errors explain connectivity', () => {
  expect(getApiErrorMessage({ response: { status: 409, data: { errorCode: 'ACTIVITY_CHANGED' } } }, t, 'common.loadFailed')).toBe(t('activities.changed'));
  expect(getApiErrorMessage({ code: 'ERR_NETWORK' }, t, 'common.loadFailed')).toBe(t('common.networkError'));
});
