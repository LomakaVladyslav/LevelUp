import { Response } from 'express';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(public status: number, message: string, public errorCode = 'INVALID_REQUEST') {
    super(message);
  }
}

export function sendError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, errorCode: error.errorCode });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    res.status(404).json({ error: 'Record not found', errorCode: 'NOT_FOUND' });
    return;
  }
  // Prisma error messages may contain complete rows, including personal data.
  console.error('Request failed:', {
    name: error instanceof Error ? error.name : 'UnknownError',
    code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
  });
  res.status(500).json({ error: 'Internal server error', errorCode: 'INTERNAL_ERROR' });
}
