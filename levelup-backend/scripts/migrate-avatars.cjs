// Run on the server that still has legacy uploads. Dry-run unless --apply is supplied.
require('dotenv/config');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const apply = process.argv.includes('--apply');
const folder = path.resolve(process.env.UPLOADS_DIR || 'uploads', 'avatars');
function mime(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
async function main() {
  const report = { apply, ready: 0, migrated: 0, skipped: [] };
  let cursor;
  while (true) {
    const users = await db.user.findMany({ where: { avatarUrl: { startsWith: '/uploads/avatars/' } }, select: { id: true, avatarUrl: true }, take: 100, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!users.length) break;
    cursor = users.at(-1).id;
    for (const user of users) {
      try {
        const file = path.join(folder, path.basename(user.avatarUrl));
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error();
        const data = await fs.readFile(file);
        const contentType = mime(data);
        if (!contentType) throw new Error();
        report.ready++;
        if (apply) await db.$transaction(async (tx) => {
          const [current] = await tx.$queryRaw`SELECT "avatarUrl" FROM "User" WHERE id = ${user.id} FOR UPDATE`;
          if (current?.avatarUrl !== user.avatarUrl) return;
          const id = randomUUID();
          await tx.avatar.upsert({ where: { userId: user.id }, create: { id, userId: user.id, data, contentType }, update: { id, data, contentType } });
          await tx.user.update({ where: { id: user.id }, data: { avatarUrl: `/api/avatars/${id}` } });
          report.migrated++;
        });
        // Keep original files for backup/rollback. No destructive file operations.
      } catch { report.skipped.push(user.id); }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.skipped.length) process.exitCode = 2;
}
main().catch(() => { console.error('Avatar migration failed; check database configuration.'); process.exitCode = 1; }).finally(() => db.$disconnect());
