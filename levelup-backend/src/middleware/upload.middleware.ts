import multer from 'multer';

export const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 8, fieldSize: 8192 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('Use a JPEG, PNG or WebP image'));
      return;
    }
    cb(null, true);
  },
});

export const hasValidImageSignature = (file: Express.Multer.File): boolean => {
  const bytes = file.buffer;
  if (!bytes || bytes.length < 12) return false;
  switch (file.mimetype) {
    case 'image/jpeg': return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    default: return false;
  }
};
