import { NextFunction, Request, Response, Router } from 'express';
import {
  register,
  login,
  getMe,
  updateMe,
  updateAvatar,
  deleteMe,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadAvatar } from '../middleware/upload.middleware';

const router = Router();

const avatarUpload = (req: Request, res: Response, next: NextFunction): void => {
  uploadAvatar.single('avatar')(req, res, (error) => {
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    next();
  });
};

router.post('/register', avatarUpload, register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);
router.post('/me/avatar', authenticate, avatarUpload, updateAvatar);
router.delete('/me', authenticate, deleteMe);

export default router;
