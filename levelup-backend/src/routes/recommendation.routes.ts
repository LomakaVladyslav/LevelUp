import { Router } from 'express';
import { getRecommendations } from '../controllers/recommendation.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getRecommendations);

export default router;
