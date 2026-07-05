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
    title: 'Morning run',
    description: 'Five kilometers',
    motivationText: 'Keep the pace',
  },
];

test('uncached records generate and persist only the requested locale', async () => {
  let generateCalls = 0;
  const saved: Array<{
    locale: string;
    motivationText: string | null;
    sourceHash: string;
  }> = [];
  let generatedLocale = '';

  const [localized] = await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Ранкова пробіжка',
      description: 'П’ять кілометрів',
      motivationText: 'Тримай темп',
      translations: [],
    }],
    'de',
    {
      generate: async (_items, locale) => {
        generateCalls += 1;
        generatedLocale = locale;
        return generated;
      },
      save: async (translations) => {
        saved.push(...translations);
      },
    },
  );

  assert.equal(generateCalls, 1);
  assert.equal(generatedLocale, 'de');
  assert.deepEqual(saved.map((item) => item.locale), ['de']);
  assert.equal(saved[0].motivationText, 'Keep the pace');
  assert.equal(localized.displayTitle, 'Morning run');
  assert.equal(localized.displayMotivationText, 'Keep the pace');
});

test('English locale uses source text without generation', async () => {
  const hash = sourceTextHash('Ранкова пробіжка', null, 'Тримай темп');
  let generateCalls = 0;
  const dependencies = {
    generate: async () => {
      generateCalls += 1;
      return generated;
    },
    save: async () => undefined,
  };

  const [localized] = await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Ранкова пробіжка',
      description: null,
      motivationText: 'Тримай темп',
      translations: [{
        locale: 'en',
        title: 'Morning run',
        description: null,
        motivationText: 'Keep the pace',
        sourceHash: hash,
      }],
    }],
    'en',
    dependencies,
  );
  assert.equal(generateCalls, 0);
  assert.equal(localized.displayTitle, 'Ранкова пробіжка');
  assert.equal(localized.displayMotivationText, 'Тримай темп');

  await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Ранкова пробіжка',
      description: null,
      motivationText: 'Новий бейдж',
      translations: [{
        locale: 'en',
        title: 'Morning run',
        description: null,
        motivationText: 'Keep the pace',
        sourceHash: hash,
      }],
    }],
    'en',
    dependencies,
  );
  assert.equal(generateCalls, 0);
});

test('generation failures fall back to original text', async () => {
  const [localized] = await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Оригінальна назва',
      description: 'Оригінальний опис',
      motivationText: 'Оригінальний бейдж',
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
  assert.equal(localized.displayMotivationText, 'Оригінальний бейдж');
});

test('generation failures fall back to a fresh cached English translation', async () => {
  const hash = sourceTextHash(
    'Ранкова пробіжка',
    'П’ять кілометрів',
    'Тримай темп',
  );
  const [localized] = await resolveLocalizedRecords(
    [{
      id: 'activity-1',
      title: 'Ранкова пробіжка',
      description: 'П’ять кілометрів',
      motivationText: 'Тримай темп',
      translations: [{
        locale: 'en',
        title: 'Morning run',
        description: 'Five kilometers',
        motivationText: 'Keep the pace',
        sourceHash: hash,
      }],
    }],
    'de',
    {
      generate: async () => {
        throw new Error('Unavailable');
      },
      save: async () => undefined,
    },
  );

  assert.equal(localized.displayTitle, 'Morning run');
  assert.equal(localized.displayDescription, 'Five kilometers');
  assert.equal(localized.displayMotivationText, 'Keep the pace');
});

test('invalid generated payloads are rejected', () => {
  assert.deepEqual(
    parseGeneratedTranslations(
      {
        translations: [{
          id: 'activity-1',
          title: 'Morning run',
          description: null,
        }],
      },
      new Set(['activity-1']),
    ),
    [],
  );
});
