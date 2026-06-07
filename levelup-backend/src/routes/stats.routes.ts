import { Router } from 'express';
import {
  getOverview,
  getWeeklyStats,
  getXpHistory,
} from '../controllers/stats.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/overview', getOverview);
router.get('/weekly', getWeeklyStats);
router.get('/xp-history', getXpHistory);

export default router;
