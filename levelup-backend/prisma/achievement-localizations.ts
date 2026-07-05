import { SupportedLocale } from '../src/utils/locale';

type AdditionalLocale = Exclude<SupportedLocale, 'en' | 'uk'>;

type AchievementCode =
  | 'first_step'
  | 'getting_going'
  | 'century'
  | 'on_fire'
  | 'unstoppable'
  | 'level_up'
  | 'veteran'
  | 'scholar'
  | 'study_explorer'
  | 'knowledge_master'
  | 'fitness_beginner'
  | 'fitness_warrior'
  | 'dedicated_user'
  | 'xp_collector';

type AchievementCopy = {
  names: Record<AchievementCode, string>;
  firstActivity: string;
  activities: (count: number) => string;
  streak: (count: number) => string;
  level: (count: number) => string;
  study: (count: number) => string;
  workout: (count: number) => string;
  xp: (count: number) => string;
};

const copy: Record<AdditionalLocale, AchievementCopy> = {
  es: {
    names: {
      first_step: 'Primer paso',
      getting_going: 'En marcha',
      century: 'Centenario',
      on_fire: 'En racha',
      unstoppable: 'Imparable',
      level_up: '¡Subida de nivel!',
      veteran: 'Veterano',
      scholar: 'Estudioso',
      study_explorer: 'Explorador del conocimiento',
      knowledge_master: 'Maestro del conocimiento',
      fitness_beginner: 'Principiante del fitness',
      fitness_warrior: 'Guerrero del fitness',
      dedicated_user: 'Usuario dedicado',
      xp_collector: 'Coleccionista de XP',
    },
    firstActivity: 'Registra tu primera actividad',
    activities: (count) => `Registra ${count} actividades en total`,
    streak: (count) => `Alcanza una racha de ${count} días`,
    level: (count) => `Alcanza el nivel ${count}`,
    study: (count) => `Completa ${count} actividades de estudio`,
    workout: (count) => `Completa ${count} entrenamientos`,
    xp: (count) => `Alcanza ${count} XP en total`,
  },
  'pt-BR': {
    names: {
      first_step: 'Primeiro passo',
      getting_going: 'Começando',
      century: 'Centenário',
      on_fire: 'Em chamas',
      unstoppable: 'Imparável',
      level_up: 'Subiu de nível!',
      veteran: 'Veterano',
      scholar: 'Estudioso',
      study_explorer: 'Explorador do conhecimento',
      knowledge_master: 'Mestre do conhecimento',
      fitness_beginner: 'Iniciante no fitness',
      fitness_warrior: 'Guerreiro do fitness',
      dedicated_user: 'Usuário dedicado',
      xp_collector: 'Colecionador de XP',
    },
    firstActivity: 'Registre sua primeira atividade',
    activities: (count) => `Registre ${count} atividades no total`,
    streak: (count) => `Alcance uma sequência de ${count} dias`,
    level: (count) => `Alcance o nível ${count}`,
    study: (count) => `Conclua ${count} atividades de estudo`,
    workout: (count) => `Conclua ${count} treinos`,
    xp: (count) => `Alcance ${count} XP no total`,
  },
  de: {
    names: {
      first_step: 'Erster Schritt',
      getting_going: 'In Schwung',
      century: 'Hundert',
      on_fire: 'Feuer und Flamme',
      unstoppable: 'Unaufhaltsam',
      level_up: 'Levelaufstieg!',
      veteran: 'Veteran',
      scholar: 'Gelehrter',
      study_explorer: 'Wissensentdecker',
      knowledge_master: 'Meister des Wissens',
      fitness_beginner: 'Fitness-Anfänger',
      fitness_warrior: 'Fitness-Krieger',
      dedicated_user: 'Engagierter Nutzer',
      xp_collector: 'XP-Sammler',
    },
    firstActivity: 'Trage deine erste Aktivität ein',
    activities: (count) => `Trage insgesamt ${count} Aktivitäten ein`,
    streak: (count) => `Erreiche eine Serie von ${count} Tagen`,
    level: (count) => `Erreiche Level ${count}`,
    study: (count) => `Schließe ${count} Lernaktivitäten ab`,
    workout: (count) => `Schließe ${count} Trainings ab`,
    xp: (count) => `Erreiche insgesamt ${count} XP`,
  },
  fr: {
    names: {
      first_step: 'Premier pas',
      getting_going: 'Bien parti',
      century: 'Centenaire',
      on_fire: 'En feu',
      unstoppable: 'Inarrêtable',
      level_up: 'Niveau supérieur !',
      veteran: 'Vétéran',
      scholar: 'Érudit',
      study_explorer: 'Explorateur du savoir',
      knowledge_master: 'Maître du savoir',
      fitness_beginner: 'Débutant en fitness',
      fitness_warrior: 'Guerrier du fitness',
      dedicated_user: 'Utilisateur assidu',
      xp_collector: 'Collectionneur de XP',
    },
    firstActivity: 'Enregistrez votre toute première activité',
    activities: (count) => `Enregistrez ${count} activités au total`,
    streak: (count) => `Atteignez une série de ${count} jours`,
    level: (count) => `Atteignez le niveau ${count}`,
    study: (count) => `Terminez ${count} activités d’étude`,
    workout: (count) => `Terminez ${count} entraînements`,
    xp: (count) => `Atteignez ${count} XP au total`,
  },
  it: {
    names: {
      first_step: 'Primo passo',
      getting_going: 'In movimento',
      century: 'Cento',
      on_fire: 'Inarrestabile',
      unstoppable: 'Implacabile',
      level_up: 'Nuovo livello!',
      veteran: 'Veterano',
      scholar: 'Studioso',
      study_explorer: 'Esploratore del sapere',
      knowledge_master: 'Maestro del sapere',
      fitness_beginner: 'Principiante del fitness',
      fitness_warrior: 'Guerriero del fitness',
      dedicated_user: 'Utente costante',
      xp_collector: 'Collezionista di XP',
    },
    firstActivity: 'Registra la tua prima attività',
    activities: (count) => `Registra ${count} attività in totale`,
    streak: (count) => `Raggiungi una serie di ${count} giorni`,
    level: (count) => `Raggiungi il livello ${count}`,
    study: (count) => `Completa ${count} attività di studio`,
    workout: (count) => `Completa ${count} allenamenti`,
    xp: (count) => `Raggiungi ${count} XP totali`,
  },
  pl: {
    names: {
      first_step: 'Pierwszy krok',
      getting_going: 'Dobry początek',
      century: 'Setka',
      on_fire: 'W ogniu',
      unstoppable: 'Nie do zatrzymania',
      level_up: 'Nowy poziom!',
      veteran: 'Weteran',
      scholar: 'Uczony',
      study_explorer: 'Odkrywca wiedzy',
      knowledge_master: 'Mistrz wiedzy',
      fitness_beginner: 'Początkujący sportowiec',
      fitness_warrior: 'Wojownik fitness',
      dedicated_user: 'Zaangażowany użytkownik',
      xp_collector: 'Kolekcjoner XP',
    },
    firstActivity: 'Dodaj swoją pierwszą aktywność',
    activities: (count) => `Dodaj łącznie ${count} aktywności`,
    streak: (count) => `Osiągnij serię ${count} dni`,
    level: (count) => `Osiągnij poziom ${count}`,
    study: (count) => `Ukończ ${count} aktywności edukacyjnych`,
    workout: (count) => `Ukończ ${count} treningów`,
    xp: (count) => `Zdobądź łącznie ${count} XP`,
  },
  tr: {
    names: {
      first_step: 'İlk Adım',
      getting_going: 'Harekete Geç',
      century: 'Yüzlük',
      on_fire: 'Alev Alev',
      unstoppable: 'Durdurulamaz',
      level_up: 'Seviye Atla!',
      veteran: 'Kıdemli',
      scholar: 'Bilgin',
      study_explorer: 'Bilgi Kaşifi',
      knowledge_master: 'Bilgi Ustası',
      fitness_beginner: 'Fitness Başlangıcı',
      fitness_warrior: 'Fitness Savaşçısı',
      dedicated_user: 'Kararlı Kullanıcı',
      xp_collector: 'XP Koleksiyoncusu',
    },
    firstActivity: 'İlk aktiviteni kaydet',
    activities: (count) => `Toplam ${count} aktivite kaydet`,
    streak: (count) => `${count} günlük bir seri yakala`,
    level: (count) => `${count}. seviyeye ulaş`,
    study: (count) => `${count} çalışma aktivitesi tamamla`,
    workout: (count) => `${count} antrenman tamamla`,
    xp: (count) => `Toplam ${count} XP kazan`,
  },
  ja: {
    names: {
      first_step: 'はじめの一歩',
      getting_going: '好調なスタート',
      century: '100回達成',
      on_fire: '絶好調',
      unstoppable: '止まらない',
      level_up: 'レベルアップ！',
      veteran: 'ベテラン',
      scholar: '学者',
      study_explorer: '知識の探検家',
      knowledge_master: '知識の達人',
      fitness_beginner: 'フィットネス初心者',
      fitness_warrior: 'フィットネス戦士',
      dedicated_user: '継続の達人',
      xp_collector: 'XPコレクター',
    },
    firstActivity: '最初のアクティビティを記録する',
    activities: (count) => `合計${count}件のアクティビティを記録する`,
    streak: (count) => `${count}日連続でアクティビティを続ける`,
    level: (count) => `レベル${count}に到達する`,
    study: (count) => `勉強アクティビティを${count}回完了する`,
    workout: (count) => `運動アクティビティを${count}回完了する`,
    xp: (count) => `合計${count} XPを獲得する`,
  },
  ko: {
    names: {
      first_step: '첫걸음',
      getting_going: '좋은 출발',
      century: '100회 달성',
      on_fire: '불타는 열정',
      unstoppable: '멈출 수 없음',
      level_up: '레벨 업!',
      veteran: '베테랑',
      scholar: '학자',
      study_explorer: '지식 탐험가',
      knowledge_master: '지식의 달인',
      fitness_beginner: '운동 초보',
      fitness_warrior: '운동 전사',
      dedicated_user: '꾸준한 사용자',
      xp_collector: 'XP 수집가',
    },
    firstActivity: '첫 활동을 기록하세요',
    activities: (count) => `활동을 총 ${count}회 기록하세요`,
    streak: (count) => `${count}일 연속 활동을 달성하세요`,
    level: (count) => `레벨 ${count}에 도달하세요`,
    study: (count) => `공부 활동을 ${count}회 완료하세요`,
    workout: (count) => `운동 활동을 ${count}회 완료하세요`,
    xp: (count) => `총 ${count} XP를 획득하세요`,
  },
  id: {
    names: {
      first_step: 'Langkah Pertama',
      getting_going: 'Mulai Bergerak',
      century: 'Seratus',
      on_fire: 'Sedang Membara',
      unstoppable: 'Tak Terhentikan',
      level_up: 'Naik Level!',
      veteran: 'Veteran',
      scholar: 'Cendekiawan',
      study_explorer: 'Penjelajah Ilmu',
      knowledge_master: 'Master Pengetahuan',
      fitness_beginner: 'Pemula Kebugaran',
      fitness_warrior: 'Pejuang Kebugaran',
      dedicated_user: 'Pengguna Berdedikasi',
      xp_collector: 'Kolektor XP',
    },
    firstActivity: 'Catat aktivitas pertamamu',
    activities: (count) => `Catat total ${count} aktivitas`,
    streak: (count) => `Capai rentetan aktivitas selama ${count} hari`,
    level: (count) => `Capai Level ${count}`,
    study: (count) => `Selesaikan ${count} aktivitas belajar`,
    workout: (count) => `Selesaikan ${count} aktivitas olahraga`,
    xp: (count) => `Raih total ${count} XP`,
  },
};

const additionalLocales = Object.keys(copy) as AdditionalLocale[];

const descriptionFor = (
  localeCopy: AchievementCopy,
  code: AchievementCode,
  condition: string,
): string => {
  if (code === 'first_step') return localeCopy.firstActivity;

  const [metric, rawValue] = condition.split(':');
  const value = Number(rawValue);

  switch (metric) {
    case 'activities_count':
      return localeCopy.activities(value);
    case 'streak_days':
      return localeCopy.streak(value);
    case 'level_reached':
      return localeCopy.level(value);
    case 'study_count':
      return localeCopy.study(value);
    case 'workout_count':
      return localeCopy.workout(value);
    case 'xp_reached':
      return localeCopy.xp(value);
    default:
      throw new Error(`Unsupported achievement condition: ${condition}`);
  }
};

export const getAdditionalAchievementTranslations = (
  code: string,
  condition: string,
) => {
  const achievementCode = code as AchievementCode;

  return additionalLocales.map((locale) => ({
    locale,
    name: copy[locale].names[achievementCode],
    description: descriptionFor(copy[locale], achievementCode, condition),
  }));
};
