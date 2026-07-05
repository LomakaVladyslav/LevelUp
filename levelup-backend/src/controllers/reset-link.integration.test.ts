import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';

const app = require('../index').default as Express;

test('password reset landing page opens the app deep link', async () => {
  const response = await request(app)
    .get('/reset-password')
    .query({ token: 'abc123' });

  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.text, /Open LevelUp/);
  assert.match(response.text, /levelup:\/\/auth\/reset-password\?token=abc123/);
});

test('password reset landing page rejects missing tokens', async () => {
  const response = await request(app).get('/reset-password');

  assert.equal(response.status, 400);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.text, /Invalid reset link/);
});
