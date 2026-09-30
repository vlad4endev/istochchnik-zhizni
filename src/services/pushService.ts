import webpush from 'web-push';
import { getFirebaseMessaging } from '../config/firebaseAdmin';
import { query } from '../config/db';
import {
  deleteFcmToken,
  getFcmTokensForMember,
  isUnrecoverableFcmErrorCode,
} from './fcmSubscriptionService';
import {
  getCombinedAppBadgeCount,
  insertMemberNotificationDelivery,
} from './notificationDeliveryService';
import { isParishionerAllowedPushKindOrType } from '../lib/parishionerPushAllowlist';

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

let vapidReady = false;
if (vapidConfigured) {
  try {
    // web-push требует subject вида mailto:… или https://…; голый e-mail нормализуем.
    const rawSubject = VAPID_SUBJECT!.trim();
    const subject = /^(mailto:|https?:\/\/)/i.test(rawSubject) ? rawSubject : `mailto:${rawSubject}`;
    webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY!.trim(), VAPID_PRIVATE_KEY!.trim());
    vapidReady = true;
  } catch (e) {
    console.error('[push] Invalid VAPID configuration — Web Push disabled:', e);
  }
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

type SaveSubscriptionRow = {
  member_id: number;
  keys_p256dh: string;
  keys_auth: string;
  user_agent: string | null;
};

export type PushChannelSummary = { attempted: number; sent: number; removed: number; failed: number };
export type PushSendSummary = { web: PushChannelSummary; fcm: PushChannelSummary };
export type WebSendOutcome = 'sent' | 'removed' | 'failed' | 'skipped';

const emptyChannel = (): PushChannelSummary => ({ attempted: 0, sent: 0, removed: 0, failed: 0 });

export type SaveSubscriptionResult = 'created' | 'updated' | 'noop';

function isMissingPushColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; message?: string };
  return (
    o.code === '42703' ||
    (typeof o.message === 'string' && /column .* does not exist/i.test(o.message))
  );
}

/** Минимальный upsert без user_agent/last_used_at — для БД до миграции. */
async function saveSubscriptionLegacy(
  memberId: number,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<SaveSubscriptionResult> {
  const existing = await query(
    `SELECT member_id, keys_p256dh, keys_auth
     FROM push_subscriptions
     WHERE endpoint = $1
     LIMIT 1`,
    [endpoint],
  );
  const row = (existing.rows[0] as Omit<SaveSubscriptionRow, 'user_agent'> | undefined) ?? null;
  if (!row) {
    await query(
      `INSERT INTO push_subscriptions (member_id, endpoint, keys_p256dh, keys_auth)
       VALUES ($1, $2, $3, $4)`,
      [memberId, endpoint, p256dh, auth],
    );
    return 'created';
  }
  if (row.member_id === memberId && row.keys_p256dh === p256dh && row.keys_auth === auth) {
    return 'noop';
  }
  await query(
    `UPDATE push_subscriptions
     SET member_id = $1, keys_p256dh = $2, keys_auth = $3
     WHERE endpoint = $4`,
    [memberId, p256dh, auth, endpoint],
  );
  return 'updated';
}

export async function saveSubscription(
  memberId: number,
  sub: PushSubscriptionData,
  userAgent?: string,
): Promise<SaveSubscriptionResult> {
  const endpoint = String(sub.endpoint ?? '').trim();
  const p256dh = String(sub.keys?.p256dh ?? '').trim();
  const auth = String(sub.keys?.auth ?? '').trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription: endpoint and keys are required');
  }
  const normalizedUserAgent =
    typeof userAgent === 'string' && userAgent.trim().length > 0 ? userAgent.trim() : null;

  try {
    const existing = await query(
      `SELECT member_id, keys_p256dh, keys_auth, user_agent
       FROM push_subscriptions
       WHERE endpoint = $1
       LIMIT 1`,
      [endpoint],
    );
    const row = (existing.rows[0] as SaveSubscriptionRow | undefined) ?? null;

    if (!row) {
      await query(
        `INSERT INTO push_subscriptions (member_id, endpoint, keys_p256dh, keys_auth, user_agent, last_used_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [memberId, endpoint, p256dh, auth, normalizedUserAgent],
      );
      return 'created';
    }

    const sameMember = row.member_id === memberId;
    const sameKeys = row.keys_p256dh === p256dh && row.keys_auth === auth;
    const sameUserAgent =
      normalizedUserAgent == null || row.user_agent === normalizedUserAgent;
    if (sameMember && sameKeys && sameUserAgent) {
      await query(
        `UPDATE push_subscriptions
         SET last_used_at = NOW()
         WHERE endpoint = $1`,
        [endpoint],
      );
      return 'noop';
    }

    await query(
      `UPDATE push_subscriptions
       SET member_id = $1,
           keys_p256dh = $2,
           keys_auth = $3,
           user_agent = COALESCE($4, push_subscriptions.user_agent),
           last_used_at = NOW()
       WHERE endpoint = $5`,
      [memberId, p256dh, auth, normalizedUserAgent, endpoint],
    );
    return 'updated';
  } catch (err) {
    if (!isMissingPushColumnError(err)) throw err;
    console.warn(
      '[push] push_subscriptions missing user_agent/last_used_at — using legacy upsert. Apply ensurePushSubscriptionsSchema / migration.',
    );
    return saveSubscriptionLegacy(memberId, endpoint, p256dh, auth);
  }
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

/** Лимит шифрованного payload Web Push — 4096 байт; безопасно укладываемся в ~3 КБ JSON. */
const WEB_PUSH_MAX_JSON_BYTES = 3000;

function serializeWebPushPayload(payload: unknown): string {
  let json = JSON.stringify(payload);
  if (Buffer.byteLength(json, 'utf8') <= WEB_PUSH_MAX_JSON_BYTES) return json;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const trimmed: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    // Второстепенные и тяжёлые поля (кнопки, картинки) отбрасываем первыми.
    for (const key of ['actions', 'image', 'icon', 'badge']) delete trimmed[key];
    json = JSON.stringify(trimmed);
    if (Buffer.byteLength(json, 'utf8') <= WEB_PUSH_MAX_JSON_BYTES) return json;
    if (typeof trimmed.body === 'string') {
      trimmed.body = `${trimmed.body.slice(0, 300)}…`;
      json = JSON.stringify(trimmed);
    }
  }
  return json;
}

export async function sendNotificationToSubscription(
  sub: PushSubscriptionData,
  payload: unknown,
): Promise<WebSendOutcome> {
  if (!vapidReady) {
    return 'skipped';
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      serializeWebPushPayload(payload),
      // urgency high — иначе Android в Doze и iOS откладывают доставку (вплоть до минут/часов).
      { TTL: 86400, urgency: 'high', timeout: WEB_PUSH_HTTP_TIMEOUT_MS },
    );
    // Mark as used
    query(`UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1`, [sub.endpoint]).catch(e => {
        console.warn('Failed to update last_used_at on push success', e);
    });
    return 'sent';
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined;
    const body =
      err && typeof err === 'object' && 'body' in err ? String((err as { body?: unknown }).body ?? '') : '';
    if (statusCode === 404 || statusCode === 410) {
      // Subscription has expired or is no longer valid
      console.log('[push] Subscription expired. Removing from DB.', sub.endpoint);
      await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
      return 'removed';
    } else if (
      statusCode === 403 &&
      (/vapid|UnauthorizedRegistration|InvalidToken|mismatch/i.test(body) ||
        /vapid|UnauthorizedRegistration|InvalidToken|mismatch/i.test(
          err instanceof Error ? err.message : String(err ?? ''),
        ))
    ) {
      // VAPID key rotated or subscription bound to another applicationServerKey
      console.warn('[push] VAPID/auth mismatch (403). Removing subscription.', {
        endpointHost: (() => {
          try {
            return new URL(sub.endpoint).host;
          } catch {
            return 'unknown';
          }
        })(),
        body: body.slice(0, 200),
      });
      await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
      return 'removed';
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
      console.error('[push] Error sending web push notification', {
        statusCode,
        endpointHost: (() => {
          try {
            return new URL(sub.endpoint).host;
          } catch {
            return 'unknown';
          }
        })(),
        message: err instanceof Error ? err.message : err,
        body: body.slice(0, 300),
      });
    }
  }
  return 'failed';
}

export async function sendNotificationToMember(
  memberId: number,
  payload: unknown,
): Promise<PushChannelSummary> {
  const summary = emptyChannel();
  if (!vapidReady) {
    return summary;
  }
  const subs = await getSubscriptionsForMember(memberId);
  const outcomes = await Promise.all(subs.map((sub) => sendNotificationToSubscription(sub, payload)));
  for (const o of outcomes) {
    if (o === 'skipped') continue;
    summary.attempted += 1;
    if (o === 'sent') summary.sent += 1;
    else if (o === 'removed') summary.removed += 1;
    else summary.failed += 1;
  }
  return summary;
}

const FCM_MULTICAST_CHUNK = 500;

export type SendPushOptions = {
  /** false — только чаты (sendPushNotification), запись в журнал не создаём, чтобы не дублировать счётчик. */
  recordDelivery?: boolean;
  /** Служебные пуши (тест из профиля): не применять фильтр по роли «прихожанин». */
  bypassRoleFilter?: boolean;
};

/**
 * Push-доставки для роли «прихожанин»:
 * чаты, трансляции, «новый участник», лента (новый пост / лайк / коммент / репост)
 * и общецерковные правила (молитва, ДР, проповеди…).
 * Координаторские/служебные назначения (media_*, music_*, coordinator_*) — нет.
 */
function isParishionerAllowedPushData(data?: Record<string, string>): boolean {
  if (!data) return false;
  const conv =
    typeof data.conversationId === 'string' && data.conversationId.trim().length > 0;
  const chatTag = typeof data.tag === 'string' && data.tag.startsWith('chat-');
  if (conv || chatTag) return true;

  if (isParishionerAllowedPushKindOrType(data.kind)) return true;
  if (isParishionerAllowedPushKindOrType(data.type)) return true;

  const tag = typeof data.tag === 'string' ? data.tag.trim().toLowerCase() : '';
  if (tag.startsWith('member-joined-')) return true;
  if (tag.startsWith('rule-') && isParishionerAllowedPushKindOrType(tag.slice('rule-'.length))) {
    return true;
  }

  const url = typeof data.url === 'string' ? data.url.toLowerCase() : '';
  if (url.includes('/broadcast')) return true;

  return false;
}

async function memberIsParishioner(memberId: number): Promise<boolean> {
  try {
    const result = await query(
      `SELECT lower(trim(COALESCE(app_role, ''))) AS r FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    const row = result.rows[0] as { r?: string } | undefined;
    return row?.r === 'parishioner';
  } catch {
    return false;
  }
}

/** Для роли parishioner отсекаются лишние массовые пуши без лишнего запроса, если тип уже разрешён. */
async function shouldDeliverPushForMember(memberId: number, data?: Record<string, string>): Promise<boolean> {
  if (isParishionerAllowedPushData(data)) return true;
  return !(await memberIsParishioner(memberId));
}

/**
 * Web Push + FCM: все подписки участника.
 */
export async function sendPush(
  memberId: number,
  title: string,
  body: string,
  data?: Record<string, string>,
  opts?: SendPushOptions,
): Promise<PushSendSummary> {
  const summary: PushSendSummary = { web: emptyChannel(), fcm: emptyChannel() };
  if (!opts?.bypassRoleFilter && !(await shouldDeliverPushForMember(memberId, data))) {
    return summary;
  }

  const recordDelivery = opts?.recordDelivery !== false;
  let deliveryId: number | undefined;
  if (recordDelivery) {
    try {
      const payloadObj: Record<string, unknown> = {};
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          payloadObj[k] = v;
        }
      }
      const id = await insertMemberNotificationDelivery({
        memberId,
        source: 'push',
        tag: data?.tag ?? null,
        title,
        body,
        payload: payloadObj,
      });
      if (id > 0) deliveryId = id;
    } catch (e) {
      console.warn('[push] notification delivery log failed', e);
    }
  }

  const webPayload: Record<string, unknown> = { title, body, ...(data ?? {}) };
  if (deliveryId != null) {
    webPayload.deliveryId = String(deliveryId);
  }
  try {
    const badge = await getCombinedAppBadgeCount(memberId);
    webPayload.badgeCount = String(badge);
  } catch (e) {
    console.warn('[push] badge count failed', e);
  }

  // Web Push и FCM независимы: медленный/недоступный один канал не должен задерживать другой.
  const results = await Promise.allSettled([
    sendNotificationToMember(memberId, webPayload),
    sendFcmToMember(memberId, title, body, data, deliveryId, webPayload.badgeCount),
  ]);
  if (results[0].status === 'fulfilled') summary.web = results[0].value;
  if (results[1].status === 'fulfilled') summary.fcm = results[1].value;
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[push] delivery channel failed', { memberId, error: r.reason });
    }
  }
  return summary;
}

/** FCM data-значения обязаны быть строками; null/undefined отбрасываем. */
function toFcmDataStrings(
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  deliveryId: number | undefined,
  badgeCount: unknown,
): Record<string, string> {
  const out: Record<string, string> = { title, body };
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined) continue;
      // Ключи на google./gcm. и from зарезервированы FCM — иначе сообщение отклоняется.
      if (k === 'from' || /^(google|gcm)/i.test(k)) continue;
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  if (deliveryId != null) out.deliveryId = String(deliveryId);
  if (typeof badgeCount === 'string') out.badgeCount = badgeCount;
  return out;
}

async function sendFcmToMember(
  memberId: number,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  deliveryId: number | undefined,
  badgeCount: unknown,
): Promise<PushChannelSummary> {
  const summary = emptyChannel();
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return summary;
  }

  const tokens = await getFcmTokensForMember(memberId);
  if (tokens.length === 0) {
    return summary;
  }

  const dataStrings = toFcmDataStrings(title, body, data, deliveryId, badgeCount);
  const isMessengerLikePush =
    (typeof dataStrings.conversationId === 'string' && dataStrings.conversationId.trim().length > 0) ||
    (typeof dataStrings.tag === 'string' && dataStrings.tag.startsWith('chat-'));
  const notificationCount =
    typeof dataStrings.badgeCount === 'string' ? Number.parseInt(dataStrings.badgeCount, 10) || 0 : 0;
  const senderName = typeof dataStrings.senderName === 'string' ? dataStrings.senderName.trim() : '';
  const channelId = isMessengerLikePush ? 'messages' : 'general';
  // Срок жизни для оффлайн-устройств: сутки (как у Web Push), дальше уведомление неактуально.
  const ttlSeconds = 86400;
  const apnsExpiration = String(Math.floor(Date.now() / 1000) + ttlSeconds);

  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_CHUNK) {
    const slice = tokens.slice(i, i + FCM_MULTICAST_CHUNK);
    let res;
    try {
      res = await messaging.sendEachForMulticast({
        tokens: slice,
        notification: { title, body },
        data: dataStrings,
        android: {
          priority: 'high',
          ttl: ttlSeconds * 1000,
          notification: {
            channelId,
            sound: 'default',
            priority: 'high',
            defaultVibrateTimings: true,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
            'apns-expiration': apnsExpiration,
          },
          payload: {
            aps: {
              alert: { title, body },
              sound: 'default',
              threadId: isMessengerLikePush ? dataStrings.conversationId ?? undefined : undefined,
              category: isMessengerLikePush ? 'MESSAGE' : 'GENERAL',
              badge: notificationCount > 0 ? notificationCount : undefined,
              mutableContent: true,
              // 'passive' доставлял уведомление «тихо» (без баннера/экрана блокировки) — часть
              // пользователей iOS не видела пуши. Всегда 'active'.
              interruptionLevel: 'active',
              relevanceScore: isMessengerLikePush ? 0.8 : 0.3,
              summaryArg: isMessengerLikePush ? senderName || title : undefined,
              summaryArgCount: isMessengerLikePush ? 1 : undefined,
            },
          },
        },
      });
    } catch (e) {
      console.warn('[push] FCM multicast request failed', {
        memberId,
        message: e instanceof Error ? e.message : String(e),
      });
      summary.attempted += slice.length;
      summary.failed += slice.length;
      continue;
    }
    summary.attempted += slice.length;
    for (let j = 0; j < res.responses.length; j++) {
      const r = res.responses[j];
      if (r.success) {
        summary.sent += 1;
        continue;
      }
      const t = slice[j];
      const code = r.error?.code;
      const message = r.error?.message;
      if (isUnrecoverableFcmErrorCode(code)) {
        console.warn('[push] FCM token invalid — removing', {
          memberId,
          code,
          tokenPrefix: t ? t.slice(0, 12) : null,
        });
        summary.removed += 1;
        if (t) {
          await deleteFcmToken(t);
        }
      } else {
        summary.failed += 1;
        console.warn('[push] FCM send failed', {
          memberId,
          code: code ?? 'unknown',
          message: message ?? null,
          tokenPrefix: t ? t.slice(0, 12) : null,
        });
      }
    }
  }
  return summary;
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
  await sendPush(memberId, title, body, data, { recordDelivery: false });
}

/** Web Push подписки, которые не подтверждались и не получали пуши дольше срока, считаем мёртвыми. */
export async function pruneStalePushSubscriptions(days = 120): Promise<number> {
  const result = await query(
    `DELETE FROM push_subscriptions
     WHERE COALESCE(last_used_at, created_at) < NOW() - ($1::int * INTERVAL '1 day')`,
    [days],
  );
  return result.rowCount ?? 0;
}
