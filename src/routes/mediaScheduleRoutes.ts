import { Router } from 'express';
import {
  assignMemberHandler,
  createRoleHandler,
  deleteRoleHandler,
  getAssignmentsForPlanHandler,
  getEventByPlanHandler,
  getEvents,
  getMediaMembersHandler,
  getMySchedule,
  getRolesHandler,
  removeAssignmentHandler,
  reorderRolesHandler,
  requireAuthSession,
  resolvePlanForChurchEventHandler,
  updateAssignmentStatusHandler,
  updateRoleHandler,
} from '../controllers/mediaScheduleController';

const router = Router();

router.use(requireAuthSession);

router.get('/events', getEvents);
router.get('/events/:id', getEventByPlanHandler);
router.post('/events/:id/assign', assignMemberHandler);

router.get('/plans/:id/assignments', getAssignmentsForPlanHandler);
router.get('/resolve-plan', resolvePlanForChurchEventHandler);

router.delete('/assignments/:id', removeAssignmentHandler);
router.patch('/assignments/:id/status', updateAssignmentStatusHandler);

router.get('/my-schedule', getMySchedule);
router.get('/members', getMediaMembersHandler);

router.get('/roles', getRolesHandler);
router.post('/roles', createRoleHandler);
router.post('/roles/reorder', reorderRolesHandler);
router.put('/roles/:id', updateRoleHandler);
router.delete('/roles/:id', deleteRoleHandler);

export default router;
