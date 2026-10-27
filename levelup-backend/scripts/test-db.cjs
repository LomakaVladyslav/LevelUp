const { spawnSync } = require('node:child_process');
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point to a dedicated database whose name ends in _test.');
}
const env = { ...process.env, DATABASE_URL: url };
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  ['--test', '-r', 'ts-node/register', 'integration/persistence.test.ts'],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
