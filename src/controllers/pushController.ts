import { Request, Response } from 'express';
import { saveSubscription, removeSubscription } from '../services/pushService';
import { ensurePushSubscriptionsSchema } from '../services/pushSubscriptionsSchema';

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

export const getVapidPublicKey = (req: Request, res: Response) => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY ?? '').trim();
  if (!publicKey) {
    res.status(503).json({ error: 'VAPID public key is not configured' });
    return;
  }
  res.json({ publicKey });
};

export const subscribeToPush = async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subscription = req.body as PushSubscriptionBody;
  
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription data' });
  }

  try {
    try {
      await ensurePushSubscriptionsSchema();
    } catch (schemaErr) {
      console.warn('[push] ensurePushSubscriptionsSchema on subscribe failed:', schemaErr);
    }
    const normalized: NormalizedPushSubscription = {
      endpoint: String(subscription.endpoint),
      keys: {
        p256dh: String(subscription.keys.p256dh),
        auth: String(subscription.keys.auth),
      },
    };
    const userAgent = req.headers['user-agent'] || req.body?.userAgent;
    await saveSubscription(memberId, normalized, userAgent);
    res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (error) {
    console.error('Failed to subscribe:', error);
    res.status(500).json({ error: 'Failed to save subscription.' });
  }
};

export const unsubscribeFromPush = async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  try {
    await removeSubscription(memberId, endpoint);
    res.status(200).json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    console.error('Failed to unsubscribe:', error);
    res.status(500).json({ error: 'Failed to remove subscription.' });
  }
};
