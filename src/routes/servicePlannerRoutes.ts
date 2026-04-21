import { Router } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import {
  deleteServiceBlockById,
  deleteServicePlanById,
  deleteServiceTemplateById,
  getServiceBlockTypes,
  getServiceTemplateById,
  getServicePlanById,
  getServicePlans,
  getServiceTemplates,
  patchServiceBlockById,
  patchServiceBlocksReorder,
  patchServicePlanById,
  patchServiceTemplateById,
  postServiceBlock,
  postServicePlan,
  postServiceTemplate,
} from '../controllers/servicePlannerController';

const router = Router();

router.get('/service-block-types', requireAuthSession, getServiceBlockTypes);
router.get('/service-templates', requireAuthSession, getServiceTemplates);
router.get('/service-templates/:id', requireAuthSession, getServiceTemplateById);
router.post('/service-templates', requireAuthSession, postServiceTemplate);
router.patch('/service-templates/:id', requireAuthSession, patchServiceTemplateById);
router.delete('/service-templates/:id', requireAuthSession, deleteServiceTemplateById);

router.get('/service-plans', requireAuthSession, getServicePlans);
router.get('/service-plans/:id', requireAuthSession, getServicePlanById);
router.post('/service-plans', requireAuthSession, postServicePlan);
router.patch('/service-plans/:id', requireAuthSession, patchServicePlanById);
router.delete('/service-plans/:id', requireAuthSession, deleteServicePlanById);

router.patch('/service-blocks/reorder', requireAuthSession, patchServiceBlocksReorder);
router.post('/service-blocks', requireAuthSession, postServiceBlock);
router.patch('/service-blocks/:id', requireAuthSession, patchServiceBlockById);
router.delete('/service-blocks/:id', requireAuthSession, deleteServiceBlockById);

export default router;
