import { Router } from 'express';

import {
  getEditableServicePlan,
  getPublicServicePlan,
  patchPublicServicePlanBlock,
  getPublicSetlist,
  patchEditableServicePlanBlock,
} from '../controllers/publicController';

const router = Router();

router.get('/setlists/:token', getPublicSetlist);
router.get('/service-plans/:token', getPublicServicePlan);
router.patch('/service-plans/:token/blocks/:blockId', patchPublicServicePlanBlock);
router.get('/service-plans-edit/:token', getEditableServicePlan);
router.patch('/service-plans-edit/:token/blocks/:blockId', patchEditableServicePlanBlock);

export default router;
