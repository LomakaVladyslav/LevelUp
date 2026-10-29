ALTER TYPE "PlannedActivityScheduleType" ADD VALUE 'WEEKLY';
ALTER TABLE "PlannedActivity" ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "scheduleHistory" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Activity" ADD COLUMN "streakDate" TIMESTAMP(3), ADD COLUMN "goalContributions" JSONB NOT NULL DEFAULT '[]';
UPDATE "Activity" SET "streakDate" = COALESCE("completedForDate", date_trunc('day', "completedAt"));
ALTER TABLE "Goal" ADD COLUMN "progressVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "CompletionUndo" ("activityId" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Preserve the previous meaning of a legacy time-only reminder. Its date was
-- anchored to updatedAt, not to each subsequent app launch.
UPDATE "PlannedActivity" SET "scheduleType" = 'DATE', "dueDate" =
  date_trunc('day', "updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE "timezone") +
  CASE WHEN "dueTimeMinutes" <= EXTRACT(HOUR FROM ("updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE "timezone")) * 60 + EXTRACT(MINUTE FROM ("updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE "timezone"))
    THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END
WHERE "scheduleType" = 'SIMPLE' AND "dueTimeMinutes" IS NOT NULL;

CREATE INDEX "CompletionUndo_userId_idx" ON "CompletionUndo"("userId");

ALTER TABLE "Goal" ADD COLUMN "progressBaseCount" INTEGER NOT NULL DEFAULT 0;
-- Legacy goals did not record completion attribution or manual edit history.
-- Preserve their exact current progress, attributing up to currentCount to the
-- latest qualifying completions; any remaining progress is a manual baseline.
WITH eligible AS (
  SELECT a."id" AS activity_id, g."id" AS goal_id, g."currentCount",
    ROW_NUMBER() OVER (PARTITION BY g."id" ORDER BY a."completedAt" DESC, a."id" DESC) AS position
  FROM "Goal" g JOIN "Activity" a ON a."userId" = g."userId" AND a."type" = g."type"
    AND a."completedAt" >= g."createdAt" AND (g."deadline" IS NULL OR a."completedAt" <= g."deadline")
), attributed AS (
  SELECT activity_id, jsonb_agg(jsonb_build_object('id', goal_id, 'version', 0, 'amount', 1)) AS contributions
  FROM eligible WHERE position <= "currentCount" GROUP BY activity_id
)
UPDATE "Activity" a SET "goalContributions" = attributed.contributions FROM attributed WHERE a."id" = attributed.activity_id;
UPDATE "Goal" g SET "progressBaseCount" = g."currentCount" - (
  SELECT COUNT(*)::integer FROM "Activity" a, jsonb_array_elements(a."goalContributions") contribution
  WHERE contribution->>'id' = g."id"
);
