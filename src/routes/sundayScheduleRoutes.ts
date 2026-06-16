import { Router } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import {
  getMySundaySchedule,
  getSundayScheduleMembers,
  getSundaySchedulePlans,
  patchSundaySchedulePlan,
} from '../controllers/sundayScheduleController';

const router = Router();

router.get('/plans', requireAuthSession, getSundaySchedulePlans);
router.get('/my', requireAuthSession, getMySundaySchedule);
router.get('/members', requireAuthSession, getSundayScheduleMembers);
router.patch('/plans/:id', requireAuthSession, patchSundaySchedulePlan);

export default router;
