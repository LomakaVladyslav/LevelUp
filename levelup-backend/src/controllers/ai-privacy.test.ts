import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/never_used';
process.env.JWT_SECRET = 'test-secret';
process.env.OPENAI_API_KEY = 'test-key-must-never-be-used';
const app = require('../index').default;
const prisma = require('../utils/prisma').default;
const { localizeActivities, localizePlannedActivities } = require('../services/content-translation.service');

test('direct authenticated AI API is disabled before reading personal data or calling a provider', async () => {
  const original = prisma.user.findUnique;
  const originalFetch = globalThis.fetch;
  let reads = 0;
  prisma.user.findUnique = async () => { reads++; return { sessionVersion: 0 }; };
  globalThis.fetch = async () => { throw new Error('Provider transmission forbidden'); };
  try {
    const token = jwt.sign({ userId: 'user-1', sessionVersion: 0 }, process.env.JWT_SECRET!);
    const response = await request(app).post('/api/ai/chat').set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'private task' }] });
    assert.equal(response.status, 503);
    assert.equal(response.body.errorCode, 'AI_DISABLED');
    assert.equal(reads, 1); // Only session validation, no profile context.
  } finally { prisma.user.findUnique = original; globalThis.fetch = originalFetch; }
});

test('all locales return original personal text even with configured provider and cached translations', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Provider transmission forbidden'); };
  try {
    const records = [{ id: '1', title: 'Приватна задача', description: 'Оригінал', motivationText: 'Моя мета', translations: [] }];
    for (const locale of ['uk', 'de', 'en', 'ja']) {
      for (const localize of [localizeActivities, localizePlannedActivities]) {
        const [result] = await localize(records, locale);
        assert.equal(result.displayTitle, records[0].title);
        assert.equal(result.displayDescription, records[0].description);
      }
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
