import { Router } from 'express';
import {
  completePlannedActivity,
  createPlannedActivitiesBulk,
  createPlannedActivity,
  deletePlannedActivity,
  getPlannedActivities,
  updatePlannedActivity,
} from '../controllers/planned-activity.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPlannedActivities);
router.post('/', createPlannedActivity);
router.post('/bulk', createPlannedActivitiesBulk);
router.patch('/:id', updatePlannedActivity);
router.delete('/:id', deletePlannedActivity);
router.post('/:id/complete', completePlannedActivity);

export default router;
