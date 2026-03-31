import { Router, type Request, type Response } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import { saveSubscription } from '../services/pushService';

type AuthReq = Request & { authUserId?: number };

const router = Router();

/**
 * POST /api/notifications/subscribe
 * Body: PushSubscription (from browser PushManager.subscribe()).
 *
 * Note: We persist into existing `push_subscriptions` table (member_id + endpoint + keys).
 */
router.post('/subscribe', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const subscription = req.body as any;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription data' });
    return;
  }

  try {
    await saveSubscription(memberId, subscription);
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[notifications] subscribe error:', e);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

export default router;

