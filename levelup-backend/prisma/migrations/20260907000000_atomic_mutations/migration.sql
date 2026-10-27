ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "MutationReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MutationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MutationReceipt_userId_key_key" ON "MutationReceipt"("userId", "key");
CREATE INDEX "MutationReceipt_createdAt_idx" ON "MutationReceipt"("createdAt");
-- NOT VALID preserves legacy rows while enforcing integrity on new/updated data.
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_duration_check" CHECK ("duration" IS NULL OR "duration" BETWEEN 1 AND 1440) NOT VALID;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_xp_check" CHECK ("xpEarned" >= 0) NOT VALID;
ALTER TABLE "PlannedActivity" ADD CONSTRAINT "PlannedActivity_time_check" CHECK ("dueTimeMinutes" IS NULL OR "dueTimeMinutes" BETWEEN 0 AND 1439) NOT VALID;
ALTER TABLE "PlannedActivity" ADD CONSTRAINT "PlannedActivity_date_check" CHECK ("scheduleType" <> 'DATE' OR "dueDate" IS NOT NULL) NOT VALID;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_counts_check" CHECK ("targetCount" > 0 AND "currentCount" >= 0) NOT VALID;

ALTER TABLE "Activity" ADD COLUMN "hiddenAt" TIMESTAMP(3);
