import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/never_used';
process.env.JWT_SECRET = 'test-secret';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-avatar-test-'));
process.env.UPLOADS_DIR = root;
fs.mkdirSync(path.join(root, 'avatars'));
fs.writeFileSync(path.join(root, 'avatars', 'own.jpg'), 'own image');
const app = require('../index').default;
const prisma = require('../utils/prisma').default;
const id = '12345678-1234-1234-1234-123456789abc';
const token = jwt.sign({ userId: 'owner', sessionVersion: 0 }, process.env.JWT_SECRET!);
prisma.user.findUnique = async ({ where }: { where: { id: string } }) => ({ sessionVersion: 0, avatarUrl: where.id === 'owner' ? '/uploads/avatars/own.jpg' : null });
prisma.avatar.findFirst = async ({ where }: { where: { id: string; userId: string } }) =>
  where.id === id && where.userId === 'owner' ? { data: Buffer.from('own image'), contentType: 'image/jpeg' } : null;
after(() => fs.rmSync(root, { recursive: true, force: true }));

test('both database and legacy avatars require authentication', async () => {
  for (const url of [`/api/avatars/${id}`, '/uploads/avatars/own.jpg']) {
    assert.equal((await request(app).get(url)).status, 401);
  }
});
test('owner can read private database and legacy avatars without public caching', async () => {
  for (const url of [`/api/avatars/${id}`, '/uploads/avatars/own.jpg']) {
    const res = await request(app).get(url).auth(token, { type: 'bearer' });
    assert.equal(res.status, 200);
    assert.equal(res.body.toString(), 'own image');
    assert.match(res.headers['cache-control'], /no-store/);
    assert.match(res.headers.vary, /Authorization/);
  }
});
test('foreign database avatar and unassigned legacy files are not accessible', async () => {
  const other = jwt.sign({ userId: 'other', sessionVersion: 0 }, process.env.JWT_SECRET!);
  assert.equal((await request(app).get(`/api/avatars/${id}`).auth(other, { type: 'bearer' })).status, 404);
  assert.equal((await request(app).get('/uploads/avatars/own.jpg').auth(other, { type: 'bearer' })).status, 404);
  assert.equal((await request(app).get('/uploads/avatars/foreign.jpg').auth(token, { type: 'bearer' })).status, 404);
});
test('invalid, absent and legacy static bypass paths return 404', async () => {
  for (const url of ['/api/avatars/invalid', '/api/avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '/uploads/private.txt', '/uploads/avatars/%2E%2E%2Fprivate.jpg', '/uploads/avatars/missing.jpg']) {
    assert.equal((await request(app).get(url).auth(token, { type: 'bearer' })).status, 404);
  }
});
