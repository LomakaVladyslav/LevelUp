import { Router } from 'express';
import {
  createActivity,
  undoActivity,
  getActivities,
  getActivityById,
  deleteActivity,
} from '../controllers/activity.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All activity routes require authentication
router.use(authenticate);

router.post('/', createActivity);
router.post('/:id/undo', undoActivity);
router.get('/', getActivities);
router.get('/:id', getActivityById);
router.delete('/:id', deleteActivity);

export default router;
