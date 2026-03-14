import { Router } from 'express';
import {
  approveAccessRequestHandler,
  listAccessRequestsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  registerHandler,
  rejectAccessRequestHandler,
} from '../controllers/authController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.post('/register', registerHandler);
router.post('/login', loginHandler);
router.get('/me', requireAuthSession, meHandler);
router.post('/logout', requireAuthSession, logoutHandler);
router.get('/access-requests', requireAuthSession, listAccessRequestsHandler);
router.post('/access-requests/:id/approve', requireAuthSession, approveAccessRequestHandler);
router.post('/access-requests/:id/reject', requireAuthSession, rejectAccessRequestHandler);

export default router;
