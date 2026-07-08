import {Router} from 'express';

import {
  bootstrapHandler,
  pullHandler,
  pushHandler,
  requireAuthSession,
} from '../controllers/syncController';

const router = Router();

router.get('/pull', requireAuthSession, pullHandler);
router.post('/push', requireAuthSession, pushHandler);
router.get('/bootstrap', requireAuthSession, bootstrapHandler);

export default router;
