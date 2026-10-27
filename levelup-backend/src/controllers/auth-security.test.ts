import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/never_used';
process.env.JWT_SECRET = 'test-secret';
const app = require('../index').default;
const prisma = require('../utils/prisma').default;
const originals = { findUnique: prisma.user.findUnique, transaction: prisma.$transaction };
afterEach(() => { prisma.user.findUnique = originals.findUnique; prisma.$transaction = originals.transaction; });
const token = (version = 0) => jwt.sign({ userId: 'owner', sessionVersion: version }, process.env.JWT_SECRET!);

test('expired, invalid-signature and revoked sessions cannot read or delete an account', async () => {
  prisma.user.findUnique = async () => ({ sessionVersion: 2 });
  prisma.$transaction = async () => { throw new Error('Must not start mutation'); };
  const expired = jwt.sign({ userId: 'owner' }, process.env.JWT_SECRET!, { expiresIn: -1 });
  for (const bearer of [expired, token(0), jwt.sign({ userId: 'owner' }, 'wrong-secret')]) {
    for (const method of ['get', 'delete'] as const) {
      const result = await request(app)[method]('/api/auth/me').auth(bearer, { type: 'bearer' });
      assert.equal(result.status, 401);
      assert.equal(result.body.errorCode, 'AUTH_SESSION_EXPIRED');
    }
  }
});
test('session validation outage returns 503, not expired-session 401', async () => {
  prisma.user.findUnique = async () => { throw new Error('private database details'); };
  const response = await request(app).delete('/api/auth/me').auth(token(), { type: 'bearer' });
  assert.equal(response.status, 503);
  assert.equal(response.body.errorCode, 'SERVICE_UNAVAILABLE');
  assert.ok(!JSON.stringify(response.body).includes('private'));
});
test('delete rechecks revocation under the lock and does not mutate a revoked account', async () => {
  prisma.user.findUnique = async () => ({ sessionVersion: 0 });
  prisma.$transaction = async (operation: (tx: unknown) => Promise<unknown>) => operation({
    $queryRaw: async () => [{ id: 'owner', sessionVersion: 1 }],
    user: { delete: async () => { throw new Error('Must not delete'); } },
  });
  const response = await request(app).delete('/api/auth/me').auth(token(), { type: 'bearer' });
  assert.equal(response.status, 401);
});
test('valid deletion affects the authenticated owner and subsequent requests are revoked', async () => {
  let deleted = false;
  prisma.user.findUnique = async () => deleted ? null : { sessionVersion: 0 };
  prisma.$transaction = async (operation: (tx: unknown) => Promise<unknown>) => operation({
    $queryRaw: async () => [{ id: 'owner', sessionVersion: 0 }],
    user: {
      findUniqueOrThrow: async () => ({ id: 'owner', avatarUrl: null }),
      delete: async ({ where }: { where: { id: string } }) => { assert.equal(where.id, 'owner'); deleted = true; },
    },
  });
  assert.equal((await request(app).delete('/api/auth/me').auth(token(), { type: 'bearer' })).status, 200);
  assert.equal((await request(app).get('/api/auth/me').auth(token(), { type: 'bearer' })).status, 401);
});
test('database pool failure during deletion remains a retryable 503', async () => {
  prisma.user.findUnique = async () => ({ sessionVersion: 0 });
  prisma.$transaction = async () => { throw new Prisma.PrismaClientKnownRequestError('private connection data', { code: 'P2024', clientVersion: '5.22.0' }); };
  const response = await request(app).delete('/api/auth/me').auth(token(), { type: 'bearer' });
  assert.equal(response.status, 503);
  assert.equal(response.body.errorCode, 'SERVICE_UNAVAILABLE');
});
