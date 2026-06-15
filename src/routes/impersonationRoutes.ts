import { Router } from 'express';
import {
  exitImpersonationHandler,
  impersonationStatusHandler,
  startImpersonationHandler,
} from '../controllers/impersonationController';
import { requireAuthSession } from '../middleware/authSession';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import { createMemberIdRateLimiter } from '../middleware/rateLimit';

const router = Router();

const impersonationStartRateLimit = createMemberIdRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'impersonation-start',
  message: 'Слишком много входов в аккаунт. Попробуйте позже.',
  resolveMemberId: (req) => {
    const r = req as { authUserId?: number };
    return r.authUserId ?? null;
  },
});

router.get('/impersonate/status', requireAuthSession, impersonationStatusHandler);
router.post('/impersonate/exit', requireAuthSession, exitImpersonationHandler);
router.post(
  '/impersonate/:targetMemberId',
  requireAuthSession,
  requireSuperAdmin,
  impersonationStartRateLimit,
  startImpersonationHandler,
);

export default router;
