import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

declare global {
  namespace Express { interface Request { user: { id: string; sessionVersion: number } } }
}

export async function sessionIsValid(userId: string, version: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  return !!user && user.sessionVersion === version;
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  let payload: jwt.JwtPayload;
  try {
    if (!header?.startsWith('Bearer ')) throw new Error('Missing token');
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET!, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string' || !decoded.userId ||
      (decoded.sessionVersion !== undefined && !Number.isInteger(decoded.sessionVersion))) throw new Error('Invalid payload');
    payload = decoded;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token', errorCode: 'AUTH_SESSION_EXPIRED' });
    return;
  }
  try {
    if (!await sessionIsValid(payload.userId, payload.sessionVersion ?? 0)) {
      res.status(401).json({ error: 'Invalid or expired token', errorCode: 'AUTH_SESSION_EXPIRED' });
      return;
    }
    req.user = { id: payload.userId, sessionVersion: payload.sessionVersion ?? 0 };
    next();
  } catch {
    // Database outages are not expired sessions. Keep the mobile login intact.
    res.status(503).json({ error: 'Service temporarily unavailable', errorCode: 'SERVICE_UNAVAILABLE' });
  }
};
