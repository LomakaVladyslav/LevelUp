import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import prisma from '../utils/prisma';
import { avatarUrlForFile, deleteAvatarFile } from '../utils/avatar';

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

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: 'Email, username and password are required' });
      return;
    }

    if (password.length < 6) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    let age: number | null;
    try {
      age = parseOptionalAge(req.body.age);
    } catch (error) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: (error as Error).message });
      return;
    }

    // Check if email or username already taken
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      cleanupUploadedAvatar(req.file);
      res.status(400).json({ error: 'Email or username already in use' });
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
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
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
      res.status(400).json({ error: (error as Error).message });
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
