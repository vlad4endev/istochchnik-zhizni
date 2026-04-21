import { Router } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import {
  getServiceBlockTypes,
  getServiceTemplateById,
  getServicePlanById,
  getServicePlans,
  getServiceTemplates,
  patchServiceBlockById,
  patchServiceBlocksReorder,
  patchServicePlanById,
  patchServiceTemplateById,
  postServicePlan,
  postServiceTemplate,
} from '../controllers/servicePlannerController';

const router = Router();

router.get('/service-block-types', requireAuthSession, getServiceBlockTypes);
router.get('/service-templates', requireAuthSession, getServiceTemplates);
router.get('/service-templates/:id', requireAuthSession, getServiceTemplateById);
router.post('/service-templates', requireAuthSession, postServiceTemplate);
router.patch('/service-templates/:id', requireAuthSession, patchServiceTemplateById);

router.get('/service-plans', requireAuthSession, getServicePlans);
router.get('/service-plans/:id', requireAuthSession, getServicePlanById);
router.post('/service-plans', requireAuthSession, postServicePlan);
router.patch('/service-plans/:id', requireAuthSession, patchServicePlanById);

router.patch('/service-blocks/reorder', requireAuthSession, patchServiceBlocksReorder);
router.patch('/service-blocks/:id', requireAuthSession, patchServiceBlockById);

export default router;
