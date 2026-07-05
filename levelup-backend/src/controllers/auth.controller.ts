import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Prisma, User } from '@prisma/client';
import prisma from '../utils/prisma';
import { avatarUrlForFile, deleteAvatarFile } from '../utils/avatar';
import { sendPasswordResetEmail } from '../services/mail.service';

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

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
    throw new Error('Age must be a whole number between 1 and 120');
  }

  return parsed;
};

const cleanupUploadedAvatar = (file?: Express.Multer.File): void => {
  if (file) {
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
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !username || !password) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({
        error: 'Email, username and password are required',
        errorCode: 'AUTH_EMAIL_USERNAME_REQUIRED',
      });
      return;
    }

    if (!isValidEmail(email)) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({
        error: 'Email is invalid',
        errorCode: 'AUTH_EMAIL_INVALID',
      });
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

    const avatarUrl = req.file ? avatarUrlForFile(req.file.filename) : null;

    const user = await prisma.user.create({
      data: { email, username, passwordHash, age, avatarUrl },
    });

    // Create a token valid for 30 days
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.status(201).json({
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    cleanupUploadedAvatar(req.file);
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.json({
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    if (!isValidEmail(email)) {
      res.status(400).json({
        error: 'Email is invalid',
        errorCode: 'AUTH_EMAIL_INVALID',
      });
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
        console.error('Password reset email error:', error);
      }
    }

    res.json(resetRequestResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
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
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
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

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { age },
    });

    res.json({ user: toPublicUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
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

    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!existing) {
      cleanupUploadedAvatar(req.file);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: avatarUrlForFile(req.file.filename) },
    });

    deleteAvatarFile(existing.avatarUrl);

    res.json({ user: toPublicUser(user) });
  } catch (error) {
    cleanupUploadedAvatar(req.file);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/auth/me
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await prisma.user.delete({ where: { id: req.user.id } });
    deleteAvatarFile(user.avatarUrl);

    res.json({ message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
