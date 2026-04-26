import { Router } from 'express';

import {
  getEditableServicePlanMeta,
  getEditableServicePlan,
  getPublicServicePlan,
  getPublicSetlist,
  patchEditableServicePlanBlock,
} from '../controllers/publicController';
import { createIpRateLimiter } from '../middleware/rateLimit';

const router = Router();
const publicTokenRateLimit = createIpRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 120,
  // SECURITY FIX: ограничиваем массовый перебор публичных токенов по IP.
  message: 'Too many requests for public token links. Please try again later.',
});

router.get('/setlists/:token', publicTokenRateLimit, getPublicSetlist);
router.get('/service-plans/:token', publicTokenRateLimit, getPublicServicePlan);
router.get('/service-plans-edit/:token', publicTokenRateLimit, getEditableServicePlan);
router.get('/service-plans-edit/:token/meta', publicTokenRateLimit, getEditableServicePlanMeta);
router.patch('/service-plans-edit/:token/blocks/:blockId', publicTokenRateLimit, patchEditableServicePlanBlock);

export default router;
