import { Router } from 'express';
import {
  getAchievements,
  getUnlockedAchievements,
} from '../controllers/achievement.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getAchievements);
router.get('/unlocked', getUnlockedAchievements);

export default router;
