import { Router } from 'express';
import {
  createMinistryDirectionTemplateHandler,
  createMinistryRoleTemplateHandler,
  createUserHandler,
  deleteMinistryDirectionTemplateHandler,
  deleteMinistryRoleTemplateHandler,
  deleteUserHandler,
  getMinistryDirectionTemplatesHandler,
  getUser,
  getMinistryRoleTemplatesHandler,
  getPrayerRequestHistoryHandler,
  getUsers,
  linkUserAccountHandler,
  setUserAppRoleHandler,
  setOneTimeMemberDateOverrideHandler,
  startPrayerCycleHandler,
  updateUserHandler,
  mergeDuplicateMembersHandler,
} from '../controllers/userController';

const router = Router();

router.get('/templates/ministry-roles', getMinistryRoleTemplatesHandler);
router.post('/templates/ministry-roles', createMinistryRoleTemplateHandler);
router.delete('/templates/ministry-roles/:id', deleteMinistryRoleTemplateHandler);
router.get('/templates/ministry-directions', getMinistryDirectionTemplatesHandler);
router.post('/templates/ministry-directions', createMinistryDirectionTemplateHandler);
router.delete('/templates/ministry-directions/:id', deleteMinistryDirectionTemplateHandler);

router.get('/', getUsers);
router.post('/merge-duplicates', mergeDuplicateMembersHandler);
router.get('/:id', getUser);
router.get('/:id/prayer-requests/history', getPrayerRequestHistoryHandler);
router.post('/', createUserHandler);
router.patch('/:id', updateUserHandler);
router.patch('/:id/app-role', setUserAppRoleHandler);
router.delete('/:id', deleteUserHandler);
router.post('/:id/link-account', linkUserAccountHandler);
router.post('/prayer-cycle/start', startPrayerCycleHandler);
router.post('/:id/prayer-cycle/one-time-date', setOneTimeMemberDateOverrideHandler);

export default router;
