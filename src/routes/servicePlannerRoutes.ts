import { Router } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import { sermonAttachmentUploadMiddleware } from '../middleware/sermonAttachmentUpload';
import {
  deleteServiceBlockById,
  deleteServicePlanById,
  deleteServiceTemplateById,
  getServiceBlockTypes,
  getServicePlannerMembers,
  getSermonFeedbackByToken,
  getServiceTemplateById,
  getMyPreacherSermonHistory,
  getServicePlanById,
  getServicePlans,
  getServiceTemplates,
  patchServiceBlockById,
  postSermonFeedbackByToken,
  patchServiceBlocksReorder,
  patchServicePlanById,
  patchServiceTemplateById,
  postServiceBlock,
  runSermonFeedbackNotificationTick,
  runServicePlanMondayMailingNow,
  postServicePlan,
  postServiceTemplate,
  uploadServicePlanSermonAttachment,
} from '../controllers/servicePlannerController';

const router = Router();

router.get('/service-block-types', requireAuthSession, getServiceBlockTypes);
router.get('/service-planner-members', requireAuthSession, getServicePlannerMembers);
router.get('/service-templates', requireAuthSession, getServiceTemplates);
router.get('/service-templates/:id', requireAuthSession, getServiceTemplateById);
router.post('/service-templates', requireAuthSession, postServiceTemplate);
router.patch('/service-templates/:id', requireAuthSession, patchServiceTemplateById);
router.delete('/service-templates/:id', requireAuthSession, deleteServiceTemplateById);

router.get('/service-plans', requireAuthSession, getServicePlans);
router.post(
  '/service-plans/monday-mailing/run',
  requireAuthSession,
  runServicePlanMondayMailingNow,
);
router.get('/service-plans/:id', requireAuthSession, getServicePlanById);
router.post('/service-plans', requireAuthSession, postServicePlan);
router.patch('/service-plans/:id', requireAuthSession, patchServicePlanById);
router.delete('/service-plans/:id', requireAuthSession, deleteServicePlanById);
router.post(
  '/service-plans/sermon-attachment',
  requireAuthSession,
  sermonAttachmentUploadMiddleware,
  uploadServicePlanSermonAttachment,
);

router.patch('/service-blocks/reorder', requireAuthSession, patchServiceBlocksReorder);
router.post('/service-blocks', requireAuthSession, postServiceBlock);
router.patch('/service-blocks/:id', requireAuthSession, patchServiceBlockById);
router.delete('/service-blocks/:id', requireAuthSession, deleteServiceBlockById);

router.get('/service-plans/sermon-feedback/:token', requireAuthSession, getSermonFeedbackByToken);
router.post('/service-plans/sermon-feedback/:token/comments', requireAuthSession, postSermonFeedbackByToken);
router.get('/service-plans/my-sermon-history', requireAuthSession, getMyPreacherSermonHistory);
router.post('/service-plans/sermon-feedback/notify-tick', requireAuthSession, runSermonFeedbackNotificationTick);

export default router;
