import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocale } from './locale';

test('locale normalization supports every application locale and regional variants', () => {
  const cases = [
    ['en-US', 'en'],
    ['uk-UA', 'uk'],
    ['es-MX', 'es'],
    ['pt-BR', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['de-AT', 'de'],
    ['fr-CA', 'fr'],
    ['it-CH', 'it'],
    ['pl-PL', 'pl'],
    ['tr-TR', 'tr'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['id-ID', 'id'],
  ] as const;

  for (const [input, expected] of cases) {
    assert.equal(normalizeLocale(input), expected);
  }

  assert.equal(normalizeLocale('uk-UA,uk;q=0.9,en;q=0.8'), 'uk');
});

test('unsupported or missing locales fall back to English', () => {
  assert.equal(normalizeLocale('nl-NL'), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
});
