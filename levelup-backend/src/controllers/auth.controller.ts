import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Prisma, User } from '@prisma/client';
import prisma from '../utils/prisma';
import { withUserLock } from '../services/user-mutation.service';
import { HttpError, sendError } from '../utils/http-error';
import { avatarUrlForFile, deleteAvatarFile } from '../utils/avatar';
import { sendPasswordResetEmail, isSmtpConfigured } from '../services/mail.service';

type PublicUser = Pick<
  User,
  'id' | 'email' | 'username' | 'xp' | 'level' | 'avatarUrl' | 'age'
>;

const toPublicUser = (user: PublicUser) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  xp: user.xp,
  level: user.level,
  avatarUrl: user.avatarUrl,
  age: user.age,
});

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_EXPIRY_MINUTES = 30;
const PASSWORD_MIN_LENGTH = 6;

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeUsername = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const hashResetToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const createPasswordResetToken = () => crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');

const createPasswordResetUrl = (token: string): string => {
  const baseUrl =
    process.env.PASSWORD_RESET_URL_BASE || 'levelup://auth/reset-password';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
};

const resetRequestResponse = {
  message: 'If an account exists for this email, a password reset link has been sent.',
};

const parseOptionalAge = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new Error('Age must be a whole number between 1 and 120');
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
    throw new Error('Age must be a whole number between 1 and 120');
  }

  return parsed;
};

const cleanupUploadedAvatar = (file?: Express.Multer.File): void => {
  if (file?.filename) {
    deleteAvatarFile(avatarUrlForFile(file.filename));
  }
};

// POST /api/auth/availability
export const availability = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);

    if (!email && !username) {
      res.status(400).json({
        error: 'Email or username is required',
        errorCode: 'AUTH_AVAILABILITY_REQUIRED',
      });
      return;
    }

    if (email && !isValidEmail(email)) {
      res.status(400).json({
        error: 'Email is invalid',
        errorCode: 'AUTH_EMAIL_INVALID',
      });
      return;
    }

    const [emailUser, usernameUser] = await Promise.all([
      email ? prisma.user.findUnique({ where: { email } }) : Promise.resolve(null),
      username
        ? prisma.user.findUnique({ where: { username } })
        : Promise.resolve(null),
    ]);

    res.json({
      ...(email ? { emailAvailable: !emailUser } : {}),
      ...(username ? { usernameAvailable: !usernameUser } : {}),
    });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (username.length > 50) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: 'Username must contain at most 50 characters' });
      return;
    }
    if (!email || !username || !password) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({
        error: 'Email, username and password are required',
        errorCode: 'AUTH_EMAIL_USERNAME_REQUIRED',
      });
      return;
    }

    if (email.length > 254 || !isValidEmail(email)) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({
        error: 'Email is invalid',
        errorCode: 'AUTH_EMAIL_INVALID',
      });
      return;
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: 'Password must be at most 72 UTF-8 bytes', errorCode: 'AUTH_PASSWORD_LONG' });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({
        error: 'Password must be at least 6 characters',
        errorCode: 'AUTH_PASSWORD_SHORT',
      });
      return;
    }

    let age: number | null;
    try {
      age = parseOptionalAge(req.body.age);
    } catch (error) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({
        error: (error as Error).message,
        errorCode: 'AUTH_AGE_INVALID',
      });
      return;
    }

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username } }),
    ]);

    if (existingEmail) {
      cleanupUploadedAvatar(req.file);
      res.status(409).json({
        error: 'Email is already in use',
        errorCode: 'AUTH_EMAIL_IN_USE',
      });
      return;
    }

    if (existingUsername) {
      cleanupUploadedAvatar(req.file);
      res.status(409).json({
        error: 'Username is already in use',
        errorCode: 'AUTH_USERNAME_IN_USE',
      });
      return;
    }

    // Hash password — never store plain text passwords
    const passwordHash = await bcrypt.hash(password, 12);

    const avatarId = req.file ? crypto.randomUUID() : null;
    const avatarUrl = avatarId ? `/api/avatars/${avatarId}` : null;
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, username, passwordHash, age, avatarUrl } });
      if (req.file && avatarId) await tx.avatar.create({ data: {
        id: avatarId, userId: created.id, data: req.file.buffer, contentType: req.file.mimetype,
      } });
      return created;
    });

    // Create a token valid for 30 days
    const token = jwt.sign({ userId: user.id, sessionVersion: user.sessionVersion }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.status(201).json({
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    cleanupUploadedAvatar(req.file);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = String(error.meta?.target ?? '').includes('email') ? 'EMAIL' : 'USERNAME';
      res.status(409).json({ error: 'Account already exists', errorCode: `AUTH_${field}_IN_USE` });
      return;
    }
    sendError(res, error);
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({
        error: 'Email and password are required',
        errorCode: 'AUTH_EMAIL_PASSWORD_REQUIRED',
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(401).json({
        error: 'Invalid email or password',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      res.status(401).json({
        error: 'Invalid email or password',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      });
      return;
    }

    const token = jwt.sign({ userId: user.id, sessionVersion: user.sessionVersion }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.json({
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/auth/forgot-password
export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      res.status(400).json({
        error: 'Email is required',
        errorCode: 'AUTH_EMAIL_REQUIRED',
      });
      return;
    }

    if (email.length > 254 || !isValidEmail(email)) {
      res.status(400).json({
        error: 'Email is invalid',
        errorCode: 'AUTH_EMAIL_INVALID',
      });
      return;
    }

    if (!isSmtpConfigured()) {
      res.status(503).json({ error: 'Password reset email is temporarily unavailable', errorCode: 'AUTH_RESET_EMAIL_FAILED' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = createPasswordResetToken();
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
      );

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      try {
        await sendPasswordResetEmail({
          to: user.email,
          username: user.username,
          resetUrl: createPasswordResetUrl(token),
        });
      } catch (error) {
        console.error('Password reset email delivery failed');
        res.status(503).json({ error: 'Could not send password reset email', errorCode: 'AUTH_RESET_EMAIL_FAILED' });
        return;
      }
    }

    res.json(resetRequestResponse);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/auth/reset-password
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!token || !password) {
      res.status(400).json({
        error: 'Token and password are required',
        errorCode: 'AUTH_RESET_TOKEN_PASSWORD_REQUIRED',
      });
      return;
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: 'Password must be at most 72 UTF-8 bytes', errorCode: 'AUTH_PASSWORD_LONG' });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({
        error: 'Password must be at least 6 characters',
        errorCode: 'AUTH_PASSWORD_SHORT',
      });
      return;
    }

    const tokenHash = hashResetToken(token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt) {
      res.status(400).json({
        error: 'Password reset token is invalid',
        errorCode: 'AUTH_RESET_TOKEN_INVALID',
      });
      return;
    }

    if (resetToken.expiresAt <= new Date()) {
      res.status(400).json({
        error: 'Password reset token has expired',
        errorCode: 'AUTH_RESET_TOKEN_EXPIRED',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const usedAt = new Date();

    await withUserLock(resetToken.userId, async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt },
      });
      if (claimed.count !== 1) throw new HttpError(400, 'Password reset token is invalid', 'AUTH_RESET_TOKEN_INVALID');
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          expiresAt: { gt: usedAt },
        },
        data: { usedAt },
      });
    });

    res.json({ message: 'Password has been reset.' });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/auth/me
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        xp: true,
        level: true,
        avatarUrl: true,
        age: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Session is no longer valid', errorCode: 'AUTH_SESSION_EXPIRED' });
      return;
    }

    res.json({ user });
  } catch (error) {
    sendError(res, error);
  }
};

// PATCH /api/auth/me
export const updateMe = async (req: Request, res: Response): Promise<void> => {
  try {
    let age: number | null;
    try {
      age = parseOptionalAge(req.body.age);
    } catch (error) {
      res.status(400).json({
        error: (error as Error).message,
        errorCode: 'AUTH_AGE_INVALID',
      });
      return;
    }

    const user = await withUserLock(req.user.id, (tx) => tx.user.update({
      where: { id: req.user.id },
      data: req.body.age === undefined ? {} : { age },
    }), req.user.sessionVersion);

    res.json({ user: toPublicUser(user) });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/auth/me/avatar
export const updateAvatar = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Avatar image is required' });
      return;
    }

    const { user, previousUrl } = await withUserLock(req.user.id, async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      const id = crypto.randomUUID();
      await tx.avatar.upsert({
        where: { userId: req.user.id },
        create: { id, userId: req.user.id, data: req.file!.buffer, contentType: req.file!.mimetype },
        update: { id, data: req.file!.buffer, contentType: req.file!.mimetype },
      });
      const user = await tx.user.update({ where: { id: req.user.id }, data: { avatarUrl: `/api/avatars/${id}` } });
      return { user, previousUrl: existing.avatarUrl };
    }, req.user.sessionVersion);
    deleteAvatarFile(previousUrl);

    res.json({ user: toPublicUser(user) });
  } catch (error) {
    cleanupUploadedAvatar(req.file);
    sendError(res, error);
  }
};

// DELETE /api/auth/me
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await withUserLock(req.user.id, async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      await tx.user.delete({ where: { id: req.user.id } });
      return existing;
    }, req.user.sessionVersion);
    deleteAvatarFile(user.avatarUrl);

    res.json({ message: 'Account deleted' });
  } catch (error) {
    sendError(res, error);
  }
};
