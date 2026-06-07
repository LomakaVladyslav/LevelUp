import fs from 'fs';
import path from 'path';

export const uploadsRoot = path.join(process.cwd(), 'uploads');
export const avatarUploadDir = path.join(uploadsRoot, 'avatars');

export const ensureAvatarUploadDir = (): void => {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
};

export const avatarUrlForFile = (filename: string): string =>
  `/uploads/avatars/${filename}`;

export const deleteAvatarFile = (avatarUrl?: string | null): void => {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) return;

  const filename = path.basename(avatarUrl);
  const filePath = path.join(avatarUploadDir, filename);

  fs.unlink(filePath, (error) => {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to delete avatar file:', error);
    }
  });
};
