import { rateLimit } from '../middleware/rate-limit.middleware';
import { NextFunction, Request, Response, Router } from 'express';
import {
  availability,
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  updateAvatar,
  deleteMe,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadAvatar, hasValidImageSignature } from '../middleware/upload.middleware';

const router = Router();
const accountLimit = rateLimit(30, 15 * 60 * 1000);
const availabilityLimit = rateLimit(120, 15 * 60 * 1000);

const avatarUpload = (req: Request, res: Response, next: NextFunction): void => {
  uploadAvatar.single('avatar')(req, res, (error) => {
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (req.file && !hasValidImageSignature(req.file)) {
      res.status(400).json({ error: 'Invalid image file' });
      return;
    }
    next();
  });
};

router.post('/availability', availabilityLimit, availability);
router.post('/register', accountLimit, avatarUpload, register);
router.post('/login', accountLimit, login);
router.post('/forgot-password', accountLimit, forgotPassword);
router.post('/reset-password', accountLimit, resetPassword);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);
router.post('/me/avatar', authenticate, avatarUpload, updateAvatar);
router.delete('/me', authenticate, deleteMe);

export default router;
