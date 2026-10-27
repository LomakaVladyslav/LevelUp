import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { avatarUploadDir } from '../utils/avatar';

const notFound = (res: Response) => { res.sendStatus(404); };

export async function getAvatar(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) { notFound(res); return; }
  try {
    const avatar = await prisma.avatar.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!avatar) { notFound(res); return; }
    res.type(avatar.contentType).send(Buffer.from(avatar.data));
  } catch { res.status(503).json({ error: 'Image temporarily unavailable' }); }
}

// Only a user's currently assigned legacy avatar is readable. No static directory mount.
export async function getLegacyAvatar(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(filename)) { notFound(res); return; }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } });
    if (user?.avatarUrl !== `/uploads/avatars/${filename}`) { notFound(res); return; }
    res.sendFile(filename, { root: avatarUploadDir, dotfiles: 'deny' }, (error) => {
      if (error && !res.headersSent) notFound(res);
    });
  } catch { res.status(503).json({ error: 'Image temporarily unavailable' }); }
}
