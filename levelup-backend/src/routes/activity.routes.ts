import { Router } from 'express';
import {
  createActivity,
  getActivities,
  getActivityById,
  deleteActivity,
} from '../controllers/activity.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All activity routes require authentication
router.use(authenticate);

router.post('/', createActivity);
router.get('/', getActivities);
router.get('/:id', getActivityById);
router.delete('/:id', deleteActivity);

export default router;
