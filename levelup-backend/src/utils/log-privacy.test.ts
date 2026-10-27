import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { sendError } from './http-error';
import { requestMetrics } from '../middleware/request-metrics.middleware';

test('error logs and responses omit exception contents', () => {
  const original = console.error;
  const logs: unknown[] = [];
  console.error = (...args) => { logs.push(args); };
  const res = { status: () => res, json: (body: unknown) => logs.push(body) } as unknown as Response;
  try {
    sendError(res, new Error('private-email@example.test password=secret'));
    assert.ok(!JSON.stringify(logs).includes('private-email'));
    assert.ok(!JSON.stringify(logs).includes('secret'));
  } finally { console.error = original; }
});
test('request metrics use route templates without query, IDs or credentials', () => {
  const original = console.info;
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const logs: unknown[] = [];
  console.info = (...args) => { logs.push(args); };
  const req = { method: 'GET', path: '/api/activities/private-id', originalUrl: '/api/activities/private-id?token=secret', route: { path: '/:id' } } as Request;
  const res = { statusCode: 200, on: (_event: string, fn: () => void) => fn() } as unknown as Response;
  try {
    requestMetrics(req, res, () => undefined);
    assert.ok(JSON.stringify(logs).includes('/:id'));
    assert.ok(!JSON.stringify(logs).includes('private-id'));
    assert.ok(!JSON.stringify(logs).includes('secret'));
  } finally {
    console.info = original;
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
  }
});
