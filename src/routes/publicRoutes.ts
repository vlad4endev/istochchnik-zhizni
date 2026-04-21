import { Router } from 'express';

import { getPublicServicePlan, getPublicSetlist } from '../controllers/publicController';

const router = Router();

router.get('/setlists/:token', getPublicSetlist);
router.get('/service-plans/:token', getPublicServicePlan);

export default router;
