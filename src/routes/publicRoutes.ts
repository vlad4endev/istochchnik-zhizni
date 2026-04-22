import { Router } from 'express';

import {
  getEditableServicePlanMeta,
  getEditableServicePlan,
  getPublicServicePlan,
  getPublicSetlist,
  patchEditableServicePlanBlock,
} from '../controllers/publicController';

const router = Router();

router.get('/setlists/:token', getPublicSetlist);
router.get('/service-plans/:token', getPublicServicePlan);
router.get('/service-plans-edit/:token', getEditableServicePlan);
router.get('/service-plans-edit/:token/meta', getEditableServicePlanMeta);
router.patch('/service-plans-edit/:token/blocks/:blockId', patchEditableServicePlanBlock);

export default router;
