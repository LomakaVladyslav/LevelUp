import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeneratedTranslation,
  parseGeneratedTranslations,
  resolveLocalizedRecords,
  sourceTextHash,
} from './content-translation.service';

const generated: GeneratedTranslation[] = [
  {
    id: 'activity-1',
    en: { title: 'Morning run', description: 'Five kilometers' },
    uk: { title: 'Ранкова пробіжка', description: 'П’ять кілометрів' },
  },
];

test('uncached records use one batch generation call and persist both locales', async () => {
  let generateCalls = 0;
  const saved: Array<{ locale: string; sourceHash: string }> = [];

  const [localized] = await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Ранкова пробіжка',
      description: 'П’ять кілометрів',
      translations: [],
    }],
    'en',
    {
      generate: async () => {
        generateCalls += 1;
        return generated;
      },
      save: async (translations) => {
        saved.push(...translations);
      },
    },
  );

  assert.equal(generateCalls, 1);
  assert.deepEqual(saved.map((item) => item.locale), ['en', 'uk']);
  assert.equal(localized.displayTitle, 'Morning run');
});

test('valid cached translations avoid generation and stale hashes regenerate', async () => {
  const hash = sourceTextHash('Ранкова пробіжка', null);
  let generateCalls = 0;
  const dependencies = {
    generate: async () => {
      generateCalls += 1;
      return generated;
    },
    save: async () => undefined,
  };

  await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Ранкова пробіжка',
      description: null,
      translations: [{
        locale: 'en',
        title: 'Morning run',
        description: null,
        sourceHash: hash,
      }],
    }],
    'en',
    dependencies,
  );
  assert.equal(generateCalls, 0);

  await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Вечірня пробіжка',
      description: null,
      translations: [{
        locale: 'en',
        title: 'Morning run',
        description: null,
        sourceHash: hash,
      }],
    }],
    'en',
    dependencies,
  );
  assert.equal(generateCalls, 1);
});

test('generation failures fall back to original text', async () => {
  const [localized] = await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Оригінальна назва',
      description: 'Оригінальний опис',
      translations: [],
    }],
    'en',
    {
      generate: async () => {
        throw new Error('Unavailable');
      },
      save: async () => undefined,
    },
  );

  assert.equal(localized.displayTitle, 'Оригінальна назва');
  assert.equal(localized.displayDescription, 'Оригінальний опис');
});

test('invalid generated payloads are rejected', () => {
  assert.deepEqual(
    parseGeneratedTranslations(
      {
        translations: [{
          id: 'activity-1',
          en: { title: '', description: null },
          uk: { title: 'Назва', description: null },
        }],
      },
      new Set(['activity-1']),
    ),
    [],
  );
});
