-- Add stable achievement identifiers while preserving existing achievement IDs.
ALTER TABLE "Achievement" ADD COLUMN "code" TEXT;

UPDATE "Achievement"
SET "code" = CASE "name"
    WHEN 'First Step' THEN 'first_step'
    WHEN 'Getting Going' THEN 'getting_going'
    WHEN 'Century' THEN 'century'
    WHEN 'On Fire' THEN 'on_fire'
    WHEN 'Unstoppable' THEN 'unstoppable'
    WHEN 'Level Up!' THEN 'level_up'
    WHEN 'Veteran' THEN 'veteran'
    WHEN 'Scholar' THEN 'scholar'
    WHEN 'Study Explorer' THEN 'study_explorer'
    WHEN 'Knowledge Master' THEN 'knowledge_master'
    WHEN 'Fitness Beginner' THEN 'fitness_beginner'
    WHEN 'Fitness Warrior' THEN 'fitness_warrior'
    WHEN 'Dedicated User' THEN 'dedicated_user'
    WHEN 'XP Collector' THEN 'xp_collector'
    ELSE 'legacy_' || md5("id")
END;

ALTER TABLE "Achievement" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

CREATE TABLE "AchievementTranslation" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "AchievementTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityTranslation" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "ActivityTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannedActivityTranslation" (
    "id" TEXT NOT NULL,
    "plannedActivityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "PlannedActivityTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AchievementTranslation_achievementId_locale_key"
ON "AchievementTranslation"("achievementId", "locale");

CREATE UNIQUE INDEX "ActivityTranslation_activityId_locale_key"
ON "ActivityTranslation"("activityId", "locale");

CREATE INDEX "ActivityTranslation_activityId_sourceHash_idx"
ON "ActivityTranslation"("activityId", "sourceHash");

CREATE UNIQUE INDEX "PlannedActivityTranslation_plannedActivityId_locale_key"
ON "PlannedActivityTranslation"("plannedActivityId", "locale");

CREATE INDEX "PlannedActivityTranslation_plannedActivityId_sourceHash_idx"
ON "PlannedActivityTranslation"("plannedActivityId", "sourceHash");

ALTER TABLE "AchievementTranslation"
ADD CONSTRAINT "AchievementTranslation_achievementId_fkey"
FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityTranslation"
ADD CONSTRAINT "ActivityTranslation_activityId_fkey"
FOREIGN KEY ("activityId") REFERENCES "Activity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlannedActivityTranslation"
ADD CONSTRAINT "PlannedActivityTranslation_plannedActivityId_fkey"
FOREIGN KEY ("plannedActivityId") REFERENCES "PlannedActivity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
