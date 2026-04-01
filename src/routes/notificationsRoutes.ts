import { Router, type Request, type Response } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import { removeSubscription, saveSubscription } from '../services/pushService';

type AuthReq = Request & { authUserId?: number };
type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type NormalizedPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const router = Router();

/**
 * GET /api/notifications/vapid-public-key
 */
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY ?? '').trim();
  if (!publicKey) {
    res.status(503).json({ error: 'VAPID public key is not configured' });
    return;
  }
  res.json({ publicKey });
});

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

  const subscription = req.body as PushSubscriptionBody;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription data' });
    return;
  }

  try {
    const normalized: NormalizedPushSubscription = {
      endpoint: String(subscription.endpoint),
      keys: {
        p256dh: String(subscription.keys.p256dh),
        auth: String(subscription.keys.auth),
      },
    };
    await saveSubscription(memberId, normalized);
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[notifications] subscribe error:', e);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/**
 * POST /api/notifications/unsubscribe
 * Body: { endpoint: string }
 */
router.post('/unsubscribe', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const endpoint = String(req.body?.endpoint ?? '').trim();
  if (!endpoint) {
    res.status(400).json({ error: 'Endpoint is required' });
    return;
  }

  try {
    await removeSubscription(memberId, endpoint);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[notifications] unsubscribe error:', e);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

export default router;

