import { Request, Response } from 'express';
import { saveSubscription, removeSubscription } from '../services/pushService';

export const getVapidPublicKey = (req: Request, res: Response) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

export const subscribeToPush = async (req: Request, res: Response) => {
  const memberId = (req as any).authUserId;
  if (!memberId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subscription = req.body;
  
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription data' });
  }

  try {
    await saveSubscription(memberId, subscription);
    res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (error) {
    console.error('Failed to subscribe:', error);
    res.status(500).json({ error: 'Failed to save subscription.' });
  }
};

export const unsubscribeFromPush = async (req: Request, res: Response) => {
  const memberId = (req as any).authUserId;
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
