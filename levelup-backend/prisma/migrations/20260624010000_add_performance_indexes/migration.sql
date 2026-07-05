CREATE INDEX "Activity_userId_completedAt_idx"
ON "Activity"("userId", "completedAt");

CREATE INDEX "XpHistory_userId_createdAt_idx"
ON "XpHistory"("userId", "createdAt");

CREATE INDEX "PlannedActivity_userId_status_dueDate_createdAt_idx"
ON "PlannedActivity"("userId", "status", "dueDate", "createdAt");
