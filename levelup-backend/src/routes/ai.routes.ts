import { rateLimit } from '../middleware/rate-limit.middleware';
import { Router } from 'express';
import { chat } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/chat', rateLimit(30, 60 * 60 * 1000, true), chat);

export default router;
