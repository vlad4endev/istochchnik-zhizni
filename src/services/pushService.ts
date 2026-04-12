import webpush from 'web-push';
import { getFirebaseMessaging } from '../config/firebaseAdmin';
import { query } from '../config/db';
import {
  deleteFcmToken,
  getFcmTokensForMember,
  isUnrecoverableFcmErrorCode,
} from './fcmSubscriptionService';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

const vapidConfigured = Boolean(
  VAPID_PUBLIC_KEY?.trim() && VAPID_PRIVATE_KEY?.trim() && VAPID_SUBJECT?.trim(),
);

/** Таймаут HTTP к FCM/Web Push (мс). На VPS с жёстким firewall иногда нужен больший срок. */
const WEB_PUSH_HTTP_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.PUSH_REQUEST_TIMEOUT_MS ?? '25000') || 25000, 5000),
  120_000,
);

let lastPushNetworkErrLogMs = 0;
const PUSH_NETWORK_ERR_LOG_INTERVAL_MS = 60_000;

function isPushNetworkTimeoutErr(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; message?: string };
  const c = typeof o.code === 'string' ? o.code : '';
  const m = typeof o.message === 'string' ? o.message : '';
  return (
    c === 'ETIMEDOUT' ||
    c === 'ESOCKETTIMEDOUT' ||
    c === 'ECONNRESET' ||
    /ETIMEDOUT|timeout|ECONNRESET/i.test(m)
  );
}

if (vapidConfigured) {
  webpush.setVapidDetails(
    VAPID_SUBJECT!,
    VAPID_PUBLIC_KEY!,
    VAPID_PRIVATE_KEY!,
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

interface PushSubRow {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

interface PushSubWithMemberRow extends PushSubRow {
  member_id: number;
}

export async function saveSubscription(memberId: number, sub: PushSubscriptionData, userAgent?: string): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (member_id, endpoint, keys_p256dh, keys_auth, user_agent, last_used_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (endpoint) DO UPDATE 
     SET member_id = EXCLUDED.member_id, 
         keys_p256dh = EXCLUDED.keys_p256dh, 
         keys_auth = EXCLUDED.keys_auth,
         user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent)`,
    [memberId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent || null]
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
  return (result.rows as PushSubRow[]).map((row) => ({
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
  return (result.rows as PushSubWithMemberRow[]).map((row) => ({
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
  return (result.rows as PushSubWithMemberRow[]).map((row) => ({
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
  payload: unknown,
): Promise<void> {
  if (!vapidConfigured) {
    return;
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      JSON.stringify(payload),
      { TTL: 86400, timeout: WEB_PUSH_HTTP_TIMEOUT_MS },
    );
    // Mark as used
    query(`UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1`, [sub.endpoint]).catch(e => {
        console.warn('Failed to update last_used_at on push success', e);
    });
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription has expired or is no longer valid
      console.log('Subscription expired. Removing from DB.', sub.endpoint);
      await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
    } else if (isPushNetworkTimeoutErr(err)) {
      const now = Date.now();
      if (now - lastPushNetworkErrLogMs >= PUSH_NETWORK_ERR_LOG_INTERVAL_MS) {
        lastPushNetworkErrLogMs = now;
        console.warn(
          '[push] Сеть: таймаут/обрыв при отправке в push-сервис (FCM/Web Push). Проверьте исходящий HTTPS с контейнера API, DNS и firewall. Можно увеличить PUSH_REQUEST_TIMEOUT_MS.',
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      console.error('Error sending push notification', err);
    }
  }
}

export async function sendNotificationToMember(memberId: number, payload: unknown): Promise<void> {
  if (!vapidConfigured) {
    return;
  }
  const subs = await getSubscriptionsForMember(memberId);
  if (subs.length === 0) {
    return;
  }
  await Promise.allSettled(subs.map((sub) => sendNotificationToSubscription(sub, payload)));
}

const FCM_MULTICAST_CHUNK = 500;

/**
 * Web Push + FCM: все подписки участника.
 */
export async function sendPush(
  memberId: number,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const webPayload: Record<string, unknown> = { title, body, ...(data ?? {}) };
  await sendNotificationToMember(memberId, webPayload);

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return;
  }

  const tokens = await getFcmTokensForMember(memberId);
  if (tokens.length === 0) {
    return;
  }

  const dataStrings: Record<string, string> = { title, body };
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      dataStrings[k] = v;
    }
  }

  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_CHUNK) {
    const slice = tokens.slice(i, i + FCM_MULTICAST_CHUNK);
    const res = await messaging.sendEachForMulticast({
      tokens: slice,
      notification: { title, body },
      data: dataStrings,
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    });
    for (let j = 0; j < res.responses.length; j++) {
      const r = res.responses[j];
      if (!r.success && isUnrecoverableFcmErrorCode(r.error?.code)) {
        const t = slice[j];
        if (t) {
          await deleteFcmToken(t);
        }
      }
    }
  }
}

/**
 * Messenger и прочие вызовы с объектом payload (как для Web Push).
 */
export async function sendPushNotification(memberId: number, payload: unknown): Promise<void> {
  const obj =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const title = String(obj.title ?? 'Уведомление');
  const body = String(obj.body ?? '');
  const data: Record<string, string> = {};
  if (Object.keys(obj).length > 0) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'title' || k === 'body') continue;
      if (v === null || v === undefined) continue;
      data[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  await sendPush(memberId, title, body, data);
}
