import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeAchievement } from './achievement-localization.service';

const achievement = {
  id: 'achievement-1',
  code: 'first_step',
  name: 'First Step',
  description: 'Log your first activity',
  translations: [
    {
      locale: 'en',
      name: 'First Step',
      description: 'Log your first activity',
    },
    {
      locale: 'uk',
      name: 'Перший крок',
      description: 'Запиши свою першу активність',
    },
  ],
};

test('achievement localization selects the requested translation', () => {
  const localized = localizeAchievement(achievement, 'uk');

  assert.equal(localized.name, 'Перший крок');
  assert.equal(localized.description, 'Запиши свою першу активність');
  assert.equal('translations' in localized, false);
});

test('achievement localization falls back to canonical English fields', () => {
  const localized = localizeAchievement(
    { ...achievement, translations: [] },
    'uk',
  );

  assert.equal(localized.name, 'First Step');
  assert.equal(localized.description, 'Log your first activity');
});
