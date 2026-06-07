import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocale } from './locale';

test('locale normalization supports English and Ukrainian variants', () => {
  assert.equal(normalizeLocale('uk-UA'), 'uk');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('uk-UA,uk;q=0.9,en;q=0.8'), 'uk');
});

test('unsupported or missing locales fall back to English', () => {
  assert.equal(normalizeLocale('pl-PL'), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
});
