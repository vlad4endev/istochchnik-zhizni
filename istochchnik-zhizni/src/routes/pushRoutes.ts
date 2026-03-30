import { Router } from 'express';
import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush } from '../controllers/pushController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', requireAuthSession, subscribeToPush);
router.post('/unsubscribe', requireAuthSession, unsubscribeFromPush);

export default router;
