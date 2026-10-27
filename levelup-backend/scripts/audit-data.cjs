// Read-only legacy data audit. Never guesses or rewrites earned rewards.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const report = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const xp = await tx.$queryRaw`
      SELECT u.id, u.xp AS stored_xp, COALESCE(h.total, 0)::bigint AS ledger_xp,
        u.level AS stored_level,
        FLOOR((1 + SQRT(1 + 0.08 * GREATEST(u.xp, 0))) / 2)::integer AS expected_level
      FROM "User" u LEFT JOIN (SELECT "userId", SUM(amount) AS total FROM "XpHistory" GROUP BY "userId") h ON h."userId" = u.id
      WHERE u.xp <> COALESCE(h.total, 0) OR u.level <> FLOOR((1 + SQRT(1 + 0.08 * GREATEST(u.xp, 0))) / 2) OR u.xp < 0
      ORDER BY u.id LIMIT 100`;
    const legacyHistory = await tx.$queryRaw`
      SELECT u.id, COALESCE(a.total, 0)::bigint AS activity_xp, COALESCE(h.total, 0)::bigint AS activity_ledger_xp
      FROM "User" u
      LEFT JOIN (SELECT "userId", SUM("xpEarned") AS total FROM "Activity" GROUP BY "userId") a ON a."userId" = u.id
      LEFT JOIN (SELECT "userId", SUM(amount) AS total FROM "XpHistory" WHERE reason = 'activity_completed' GROUP BY "userId") h ON h."userId" = u.id
      WHERE COALESCE(a.total, 0) <> COALESCE(h.total, 0) ORDER BY u.id LIMIT 100`;
    const invalidRows = await tx.$queryRaw`
      SELECT 'Activity' AS table_name, COUNT(*)::integer AS invalid_count FROM "Activity"
        WHERE "xpEarned" < 0 OR (duration IS NOT NULL AND duration NOT BETWEEN 1 AND 1440)
      UNION ALL SELECT 'PlannedActivity', COUNT(*)::integer FROM "PlannedActivity"
        WHERE ("dueTimeMinutes" IS NOT NULL AND "dueTimeMinutes" NOT BETWEEN 0 AND 1439) OR ("scheduleType" = 'DATE' AND "dueDate" IS NULL)
      UNION ALL SELECT 'Goal', COUNT(*)::integer FROM "Goal"
        WHERE "targetCount" <= 0 OR "currentCount" < 0 OR "currentCount" > "targetCount" OR "isCompleted" <> ("currentCount" >= "targetCount")
      UNION ALL SELECT 'Streak', COUNT(*)::integer FROM "Streak"
        WHERE "currentCount" < 0 OR "longestCount" < "currentCount"`;
    const legacyAvatars = await tx.user.count({ where: { avatarUrl: { startsWith: '/uploads/' } } });
    return { xp, legacyHistory, invalidRows, legacyAvatars };
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  console.log(JSON.stringify({ readOnly: true, sampleLimit: 100, ...report }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  if (report.xp.length || report.legacyHistory.length || report.invalidRows.some((row) => row.invalid_count > 0)) process.exitCode = 2;
}
main().catch(() => { console.error('Data audit failed; check database configuration and migrations.'); process.exitCode = 1; }).finally(() => db.$disconnect());
