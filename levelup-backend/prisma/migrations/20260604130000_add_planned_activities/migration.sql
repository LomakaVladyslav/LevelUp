-- CreateEnum
CREATE TYPE "PlannedActivityScheduleType" AS ENUM ('SIMPLE', 'DAILY', 'DATE');

-- CreateEnum
CREATE TYPE "PlannedActivityStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISABLED');

-- AlterTable
ALTER TABLE "Activity"
ADD COLUMN "plannedActivityId" TEXT,
ADD COLUMN "completedForDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlannedActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" "PlannedActivityScheduleType" NOT NULL DEFAULT 'SIMPLE',
    "dueDate" TIMESTAMP(3),
    "dueTimeMinutes" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "PlannedActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_plannedActivityId_idx" ON "Activity"("plannedActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_userId_plannedActivityId_completedForDate_key" ON "Activity"("userId", "plannedActivityId", "completedForDate");

-- CreateIndex
CREATE INDEX "PlannedActivity_userId_status_idx" ON "PlannedActivity"("userId", "status");

-- CreateIndex
CREATE INDEX "PlannedActivity_userId_scheduleType_idx" ON "PlannedActivity"("userId", "scheduleType");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_plannedActivityId_fkey" FOREIGN KEY ("plannedActivityId") REFERENCES "PlannedActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedActivity" ADD CONSTRAINT "PlannedActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
