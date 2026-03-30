import webpush from 'web-push';
import { query } from '../config/db';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn('VAPID keys are not configured. Web Push will not work.');
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export async function saveSubscription(memberId: number, sub: PushSubscriptionData): Promise<void> {
  const result = await query(
    `INSERT INTO push_subscriptions (member_id, endpoint, keys_p256dh, keys_auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE 
     SET member_id = EXCLUDED.member_id, 
         keys_p256dh = EXCLUDED.keys_p256dh, 
         keys_auth = EXCLUDED.keys_auth`,
    [memberId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function removeSubscription(memberId: number, endpoint: string): Promise<void> {
  await query(
    `DELETE FROM push_subscriptions WHERE member_id = $1 AND endpoint = $2`,
    [memberId, endpoint]
  );
}

export async function getSubscriptionsForMember(memberId: number): Promise<PushSubscriptionData[]> {
  const result = await query(
    `SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE member_id = $1`,
    [memberId]
  );
  return result.rows.map((row: any) => ({
    endpoint: row.endpoint,
    keys: {
      p256dh: row.keys_p256dh,
      auth: row.keys_auth,
    },
  }));
}

export async function getAllSubscriptions(): Promise<{member_id: number, sub: PushSubscriptionData}[]> {
  const result = await query(
    `SELECT member_id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions`
  );
  return result.rows.map((row: any) => ({
    member_id: row.member_id,
    sub: {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.keys_p256dh,
        auth: row.keys_auth,
      },
    }
  }));
}

export async function getSubscriptionsForCoordinators(): Promise<{member_id: number, sub: PushSubscriptionData}[]> {
  const result = await query(
    `SELECT ps.member_id, ps.endpoint, ps.keys_p256dh, ps.keys_auth 
     FROM push_subscriptions ps
     JOIN members m ON m.id = ps.member_id
     WHERE m.is_collection_coordinator = TRUE AND m.is_active = TRUE`
  );
  return result.rows.map((row: any) => ({
    member_id: row.member_id,
    sub: {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.keys_p256dh,
        auth: row.keys_auth,
      },
    }
  }));
}

export async function sendNotificationToSubscription(
  sub: PushSubscriptionData,
  payload: any
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      JSON.stringify(payload)
    );
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      // Subscription has expired or is no longer valid
      console.log('Subscription expired. Removing from DB.', sub.endpoint);
      await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
    } else {
      console.error('Error sending push notification', err);
    }
  }
}

export async function sendNotificationToMember(memberId: number, payload: any): Promise<void> {
  const subs = await getSubscriptionsForMember(memberId);
  for (const sub of subs) {
    await sendNotificationToSubscription(sub, payload);
  }
}
