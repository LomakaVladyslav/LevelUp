import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../index').default as Express;
const prisma = require('../utils/prisma').default as typeof import('../utils/prisma').default;
const mailService = require('../services/mail.service') as typeof import('../services/mail.service');

const restoreCallbacks: Array<() => void> = [];

const stubMethod = <T extends Record<string, unknown>>(
  target: T,
  methodName: keyof T,
  replacement: unknown,
) => {
  const original = target[methodName];
  (target as Record<string, unknown>)[methodName as string] = replacement;
  restoreCallbacks.push(() => {
    (target as Record<string, unknown>)[methodName as string] = original;
  });
};

const user = {
  id: 'user-1',
  email: 'user@example.com',
  username: 'tester',
  passwordHash: '$2a$12$hash',
  avatarUrl: null,
  age: null,
  xp: 0,
  level: 1,
  createdAt: new Date('2026-06-25T00:00:00.000Z'),
  updatedAt: new Date('2026-06-25T00:00:00.000Z'),
};

afterEach(() => {
  for (const restore of restoreCallbacks.splice(0).reverse()) {
    restore();
  }
});

test('auth availability reports taken email and available username', async () => {
  stubMethod(
    prisma.user as unknown as Record<string, unknown>,
    'findUnique',
    async ({ where }: { where: { email?: string; username?: string } }) =>
      where.email === user.email ? user : null,
  );

  const response = await request(app)
    .post('/api/auth/availability')
    .send({ email: user.email, username: 'new-user' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    emailAvailable: false,
    usernameAvailable: true,
  });
});

test('register returns a specific duplicate email error', async () => {
  stubMethod(
    prisma.user as unknown as Record<string, unknown>,
    'findUnique',
    async ({ where }: { where: { email?: string; username?: string } }) =>
      where.email === user.email ? user : null,
  );

  const response = await request(app)
    .post('/api/auth/register')
    .field('email', user.email)
    .field('username', 'new-user')
    .field('password', 'secret1');

  assert.equal(response.status, 409);
  assert.equal(response.body.errorCode, 'AUTH_EMAIL_IN_USE');
});

test('register returns a specific duplicate username error', async () => {
  stubMethod(
    prisma.user as unknown as Record<string, unknown>,
    'findUnique',
    async ({ where }: { where: { email?: string; username?: string } }) =>
      where.username === user.username ? user : null,
  );

  const response = await request(app)
    .post('/api/auth/register')
    .field('email', 'new@example.com')
    .field('username', user.username)
    .field('password', 'secret1');

  assert.equal(response.status, 409);
  assert.equal(response.body.errorCode, 'AUTH_USERNAME_IN_USE');
});

test('login rejects invalid credentials with an auth error code', async () => {
  stubMethod(
    prisma.user as unknown as Record<string, unknown>,
    'findUnique',
    async () => null,
  );

  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'missing@example.com', password: 'secret1' });

  assert.equal(response.status, 401);
  assert.equal(response.body.errorCode, 'AUTH_INVALID_CREDENTIALS');
});

test('forgot password returns generic success for unknown email', async () => {
  let emailSent = false;

  stubMethod(
    prisma.user as unknown as Record<string, unknown>,
    'findUnique',
    async () => null,
  );
  stubMethod(mailService as unknown as Record<string, unknown>, 'sendPasswordResetEmail', async () => {
    emailSent = true;
  });

  const response = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'missing@example.com' });

  assert.equal(response.status, 200);
  assert.equal(response.body.message.includes('password reset link'), true);
  assert.equal(emailSent, false);
});

test('reset password rejects invalid tokens', async () => {
  stubMethod(
    prisma.passwordResetToken as unknown as Record<string, unknown>,
    'findUnique',
    async () => null,
  );

  const response = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: 'bad-token', password: 'secret1' });

  assert.equal(response.status, 400);
  assert.equal(response.body.errorCode, 'AUTH_RESET_TOKEN_INVALID');
});

test('reset password rejects expired tokens', async () => {
  stubMethod(
    prisma.passwordResetToken as unknown as Record<string, unknown>,
    'findUnique',
    async () => ({
      id: 'reset-1',
      userId: user.id,
      tokenHash: 'token-hash',
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
    }),
  );

  const response = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: 'expired-token', password: 'secret1' });

  assert.equal(response.status, 400);
  assert.equal(response.body.errorCode, 'AUTH_RESET_TOKEN_EXPIRED');
});

test('reset password updates password and consumes active reset tokens', async () => {
  const resetToken = {
    id: 'reset-1',
    userId: user.id,
    tokenHash: 'token-hash',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    usedAt: null,
    createdAt: new Date('2026-06-25T00:00:00.000Z'),
  };
  let updatedHash = '';
  let consumedTokens = false;

  stubMethod(
    prisma.passwordResetToken as unknown as Record<string, unknown>,
    'findUnique',
    async () => resetToken,
  );
  stubMethod(prisma as unknown as Record<string, unknown>, '$transaction', async (operation: unknown) =>
    typeof operation === 'function' ? operation(prisma) : Promise.all(operation as Promise<unknown>[]),
  );
  stubMethod(
    prisma.user as unknown as Record<string, unknown>,
    'update',
    async ({ data }: { data: { passwordHash: string } }) => {
      updatedHash = data.passwordHash;
      return { ...user, passwordHash: data.passwordHash };
    },
  );
  stubMethod(
    prisma.passwordResetToken as unknown as Record<string, unknown>,
    'updateMany',
    async () => {
      consumedTokens = true;
      return { count: 1 };
    },
  );

  const response = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: 'valid-token', password: 'secret1' });

  assert.equal(response.status, 200);
  assert.equal(await bcrypt.compare('secret1', updatedHash), true);
  assert.equal(consumedTokens, true);
});
