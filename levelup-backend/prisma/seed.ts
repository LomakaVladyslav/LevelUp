import { PrismaClient } from '@prisma/client';
import { getAdditionalAchievementTranslations } from './achievement-localizations';

const prisma = new PrismaClient();

type AchievementSeed = {
  code: string;
  name: string;
  description: string;
  iconEmoji: string;
  condition: string;
  xpReward: number;
  uk: {
    name: string;
    description: string;
  };
};

const achievements: AchievementSeed[] = [
  {
    code: 'first_step',
    name: 'First Step',
    description: 'Log your very first activity',
    iconEmoji: '👶',
    condition: 'activities_count:1',
    xpReward: 50,
    uk: {
      name: 'Перший крок',
      description: 'Запиши свою першу активність',
    },
  },
  {
    code: 'getting_going',
    name: 'Getting Going',
    description: 'Log 10 activities total',
    iconEmoji: '🚀',
    condition: 'activities_count:10',
    xpReward: 100,
    uk: {
      name: 'Вдалий початок',
      description: 'Запиши загалом 10 активностей',
    },
  },
  {
    code: 'century',
    name: 'Century',
    description: 'Log 100 activities total',
    iconEmoji: '💯',
    condition: 'activities_count:100',
    xpReward: 500,
    uk: {
      name: 'Сотня',
      description: 'Запиши загалом 100 активностей',
    },
  },
  {
    code: 'on_fire',
    name: 'On Fire',
    description: 'Reach a 7-day activity streak',
    iconEmoji: '🔥',
    condition: 'streak_days:7',
    xpReward: 150,
    uk: {
      name: 'У вогні',
      description: 'Досягни серії активностей у 7 днів',
    },
  },
  {
    code: 'unstoppable',
    name: 'Unstoppable',
    description: 'Reach a 30-day activity streak',
    iconEmoji: '⚡',
    condition: 'streak_days:30',
    xpReward: 500,
    uk: {
      name: 'Нестримний',
      description: 'Досягни серії активностей у 30 днів',
    },
  },
  {
    code: 'level_up',
    name: 'Level Up!',
    description: 'Reach Level 5',
    iconEmoji: '⬆️',
    condition: 'level_reached:5',
    xpReward: 200,
    uk: {
      name: 'Новий рівень!',
      description: 'Досягни 5 рівня',
    },
  },
  {
    code: 'veteran',
    name: 'Veteran',
    description: 'Reach Level 10',
    iconEmoji: '🏅',
    condition: 'level_reached:10',
    xpReward: 500,
    uk: {
      name: 'Ветеран',
      description: 'Досягни 10 рівня',
    },
  },
  {
    code: 'scholar',
    name: 'Scholar',
    description: 'Log 20 study sessions',
    iconEmoji: '📚',
    condition: 'study_count:20',
    xpReward: 200,
    uk: {
      name: 'Знавець',
      description: 'Запиши 20 навчальних сесій',
    },
  },
  {
    code: 'study_explorer',
    name: 'Study Explorer',
    description: 'Complete 10 study activities',
    iconEmoji: '🔎',
    condition: 'study_count:10',
    xpReward: 100,
    uk: {
      name: 'Дослідник знань',
      description: 'Виконай 10 навчальних активностей',
    },
  },
  {
    code: 'knowledge_master',
    name: 'Knowledge Master',
    description: 'Complete 50 study activities',
    iconEmoji: '🧠',
    condition: 'study_count:50',
    xpReward: 300,
    uk: {
      name: 'Майстер знань',
      description: 'Виконай 50 навчальних активностей',
    },
  },
  {
    code: 'fitness_beginner',
    name: 'Fitness Beginner',
    description: 'Complete 10 workout activities',
    iconEmoji: '🏃',
    condition: 'workout_count:10',
    xpReward: 100,
    uk: {
      name: 'Початківець у фітнесі',
      description: 'Виконай 10 тренувань',
    },
  },
  {
    code: 'fitness_warrior',
    name: 'Fitness Warrior',
    description: 'Complete 50 workout activities',
    iconEmoji: '💪',
    condition: 'workout_count:50',
    xpReward: 300,
    uk: {
      name: 'Воїн фітнесу',
      description: 'Виконай 50 тренувань',
    },
  },
  {
    code: 'dedicated_user',
    name: 'Dedicated User',
    description: 'Maintain a 14-day activity streak',
    iconEmoji: '📅',
    condition: 'streak_days:14',
    xpReward: 250,
    uk: {
      name: 'Відданий користувач',
      description: 'Підтримуй серію активностей у 14 днів',
    },
  },
  {
    code: 'xp_collector',
    name: 'XP Collector',
    description: 'Reach 1000 total XP',
    iconEmoji: '⭐',
    condition: 'xp_reached:1000',
    xpReward: 250,
    uk: {
      name: 'Колекціонер XP',
      description: 'Набери загалом 1000 XP',
    },
  },
];

async function main() {
  console.log('Seeding achievements...');

  for (const seed of achievements) {
    const achievement = await prisma.achievement.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        description: seed.description,
        iconEmoji: seed.iconEmoji,
        condition: seed.condition,
        xpReward: seed.xpReward,
      },
      create: {
        code: seed.code,
        name: seed.name,
        description: seed.description,
        iconEmoji: seed.iconEmoji,
        condition: seed.condition,
        xpReward: seed.xpReward,
      },
    });

    const translations = [
      {
        locale: 'en',
        name: seed.name,
        description: seed.description,
      },
      {
        locale: 'uk',
        name: seed.uk.name,
        description: seed.uk.description,
      },
      ...getAdditionalAchievementTranslations(seed.code, seed.condition),
    ];

    for (const translation of translations) {
      await prisma.achievementTranslation.upsert({
        where: {
          achievementId_locale: {
            achievementId: achievement.id,
            locale: translation.locale,
          },
        },
        update: translation,
        create: {
          achievementId: achievement.id,
          ...translation,
        },
      });
    }
  }

  console.log(`Seeded ${achievements.length} achievements successfully.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
