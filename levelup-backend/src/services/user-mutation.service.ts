import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import prisma from '../utils/prisma';
import { HttpError } from '../utils/http-error';

// Lock before reading any state used by a mutation. Other users remain independent.
// No network calls or filesystem work belong in these transactions.
export async function withUserLock<T>(userId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>, sessionVersion?: number): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; sessionVersion: number }>>`
      SELECT "id", "sessionVersion" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (!rows.length || (sessionVersion !== undefined && rows[0].sessionVersion !== sessionVersion)) throw new HttpError(401, 'Session is no longer valid', 'AUTH_SESSION_EXPIRED');
    return operation(tx);
  }, { maxWait: 5000, timeout: 15000 });
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
};

export async function runMutation<T>(req: Request, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const key = req.get('Idempotency-Key');
  if (key && !/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    throw new HttpError(400, 'Invalid idempotency key');
  }
  const requestHash = createHash('sha256').update(JSON.stringify([
    req.method, req.originalUrl.split('?')[0], canonical(req.body ?? {}),
  ])).digest('hex');

  return withUserLock(req.user.id, async (tx) => {
    if (key) {
      const previous = await tx.mutationReceipt.findUnique({
        where: { userId_key: { userId: req.user.id, key } },
      });
      if (previous) {
        if (previous.requestHash !== requestHash) {
          throw new HttpError(409, 'This request key was used for different data', 'IDEMPOTENCY_CONFLICT');
        }
        const activityId = (previous.response as { activity?: { id?: string } })?.activity?.id;
        if (activityId && await tx.completionUndo.findUnique({ where: { activityId } })) {
          throw new HttpError(409, 'This completion was undone. Reload before completing again.', 'COMPLETION_UNDONE');
        }
        return previous.response as T;
      }
    }
    const result = await operation(tx);
    if (key) {
      await tx.mutationReceipt.create({ data: {
        userId: req.user.id, key, requestHash,
        response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      } });
    }
    return result;
  }, req.user.sessionVersion);
}
