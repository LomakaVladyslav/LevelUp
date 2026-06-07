import { SupportedLocale } from '../utils/locale';

type AchievementTranslation = {
  locale: string;
  name: string;
  description: string;
};

type TranslatableAchievement = {
  name: string;
  description: string;
  translations: AchievementTranslation[];
};

export const localizeAchievement = <T extends TranslatableAchievement>(
  achievement: T,
  locale: SupportedLocale,
): Omit<T, 'translations'> => {
  const { translations, ...base } = achievement;
  const translation = translations.find((item) => item.locale === locale)
    ?? translations.find((item) => item.locale === 'en');

  return {
    ...base,
    name: translation?.name ?? achievement.name,
    description: translation?.description ?? achievement.description,
  };
};
