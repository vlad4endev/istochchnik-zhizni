import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import { deleteFcmTokenForDevice, saveFcmToken } from '../services/fcmSubscriptionService';
import {
  getUnreadNotificationDeliveryCount,
  insertMemberNotificationDelivery,
  markAllNotificationDeliveriesOpened,
  markNotificationDeliveryDismissed,
  markNotificationDeliveryOpened,
} from '../services/notificationDeliveryService';
import { removeSubscription, saveSubscription, sendPush } from '../services/pushService';
import { getFirebaseMessaging } from '../config/firebaseAdmin';
import { query } from '../config/db';
import { ensurePushSubscriptionsSchema } from '../services/pushSubscriptionsSchema';

let pushSchemaEnsurePromise: Promise<void> | null = null;

async function ensurePushSchemaOnce(): Promise<void> {
  if (!pushSchemaEnsurePromise) {
    pushSchemaEnsurePromise = ensurePushSubscriptionsSchema().catch((err) => {
      pushSchemaEnsurePromise = null;
      throw err;
    });
  }
  await pushSchemaEnsurePromise;
}

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
    try {
      await ensurePushSchemaOnce();
    } catch (schemaErr) {
      console.warn('[notifications] ensurePushSubscriptionsSchema on subscribe failed:', schemaErr);
    }
    const normalized: NormalizedPushSubscription = {
      endpoint: String(subscription.endpoint),
      keys: {
        p256dh: String(subscription.keys.p256dh),
        auth: String(subscription.keys.auth),
      },
    };
    const userAgent = req.headers['user-agent'] || req.body?.userAgent;
    const saveResult = await saveSubscription(memberId, normalized, userAgent);
    if (saveResult !== 'noop') {
      try {
        const host = new URL(normalized.endpoint).host;
        console.log('[notifications] web push subscribe ok', { memberId, pushHost: host, status: saveResult });
      } catch {
        console.log('[notifications] web push subscribe ok', { memberId, status: saveResult });
      }
    }
    res.status(saveResult === 'created' ? 201 : 200).json({ ok: true, status: saveResult });
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

/**
 * POST /api/notifications/save-token
 * Body: { fcm_token: string, device_id: string } — нативное FCM (Capacitor).
 */
router.post(
  '/save-token',
  (req: Request, _res: Response, next: NextFunction) => {
    const authId = (req as AuthReq).authUserId;
    console.info('[notifications] save-token attempt', {
      memberId: authId ?? null,
      hasFcmToken: typeof req.body?.fcm_token === 'string' && req.body.fcm_token.trim().length > 0,
      hasDeviceId: typeof req.body?.device_id === 'string' && req.body.device_id.trim().length > 0,
      origin: req.header('origin') ?? null,
    });
    next();
  },
  requireAuthSession,
  async (req: Request, res: Response) => {
    const memberId = (req as AuthReq).authUserId;
    if (!memberId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const fcm_token = typeof req.body?.fcm_token === 'string' ? req.body.fcm_token.trim() : '';
    const device_id = typeof req.body?.device_id === 'string' ? req.body.device_id.trim() : '';
    if (!fcm_token || !device_id) {
      res.status(400).json({ error: 'Fields fcm_token and device_id are required' });
      return;
    }
    if (fcm_token.length > 4096 || device_id.length > 512) {
      res.status(400).json({ error: 'Invalid field length' });
      return;
    }

    try {
      try {
        await ensurePushSchemaOnce();
      } catch (schemaErr) {
        console.warn('[notifications] ensurePushSubscriptionsSchema on save-token failed:', schemaErr);
      }
      await saveFcmToken(memberId, device_id, fcm_token);
      console.info('[notifications] save-token ok', { memberId, deviceId: device_id.slice(0, 12) });
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error('[notifications] save-token error:', e);
      res.status(500).json({ error: 'Failed to save token' });
    }
  },
);

/**
 * GET /api/notifications/status?endpoint=...
 * Диагностика для экрана «Уведомления»: настроен ли сервер, сколько устройств у участника,
 * известна ли серверу подписка этого браузера.
 */
router.get('/status', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
  try {
    const web = await query(
      `SELECT endpoint FROM push_subscriptions WHERE member_id = $1`,
      [memberId],
    );
    const native = await query(
      `SELECT COUNT(*)::int AS n FROM user_subscriptions WHERE member_id = $1`,
      [memberId],
    );
    const endpoints = (web.rows as { endpoint: string }[]).map((r) => r.endpoint);
    res.json({
      vapidConfigured: Boolean(String(process.env.VAPID_PUBLIC_KEY ?? '').trim()),
      fcmConfigured: getFirebaseMessaging() != null,
      webSubscriptions: endpoints.length,
      nativeDevices: Number((native.rows[0] as { n?: number } | undefined)?.n ?? 0),
      currentEndpointRegistered: endpoint ? endpoints.includes(endpoint) : null,
    });
  } catch (e) {
    console.error('[notifications] status error:', e);
    res.status(500).json({ error: 'Failed to load status' });
  }
});

const lastTestPushByMember = new Map<number, number>();

/**
 * POST /api/notifications/test
 * Отправляет тестовый пуш на все устройства участника и возвращает сводку доставки.
 */
router.post('/test', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const now = Date.now();
  const last = lastTestPushByMember.get(memberId) ?? 0;
  if (now - last < 10_000) {
    res.status(429).json({ error: 'Подождите несколько секунд перед повторной проверкой' });
    return;
  }
  lastTestPushByMember.set(memberId, now);
  try {
    const summary = await sendPush(
      memberId,
      'Проверка уведомлений',
      'Если вы видите это сообщение — push работает на этом устройстве.',
      { url: '/profile', type: 'push_test', tag: 'push-test' },
      { recordDelivery: false, bypassRoleFilter: true },
    );
    res.json({ ok: true, summary });
  } catch (e) {
    console.error('[notifications] test push error:', e);
    res.status(500).json({ error: 'Failed to send test push' });
  }
});

/**
 * POST /api/notifications/remove-token
 * Body: { device_id: string } — выход из аккаунта на нативном устройстве.
 */
router.post('/remove-token', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const device_id = typeof req.body?.device_id === 'string' ? req.body.device_id.trim() : '';
  if (!device_id || device_id.length > 512) {
    res.status(400).json({ error: 'Field device_id is required' });
    return;
  }
  try {
    await deleteFcmTokenForDevice(memberId, device_id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[notifications] remove-token error:', e);
    res.status(500).json({ error: 'Failed to remove token' });
  }
});

/**
 * GET /api/notifications/unread-deliveries-count
 * Непрочитанные записи журнала push/напоминаний (ещё не открыты по тапу из трея).
 */
router.get('/unread-deliveries-count', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const count = await getUnreadNotificationDeliveryCount(memberId);
    res.json({ count });
  } catch (e) {
    console.error('[notifications] unread-deliveries-count error:', e);
    res.status(500).json({ error: 'Failed to load count' });
  }
});

/**
 * POST /api/notifications/deliveries/:id/open
 * Помечает доставку открытой (снимается с бейджа). Вызывается из SW при клике по уведомлению.
 */
router.post('/deliveries/:id/open', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const ok = await markNotificationDeliveryOpened(id, memberId);
    res.json({ ok });
  } catch (e) {
    console.error('[notifications] delivery open error:', e);
    res.status(500).json({ error: 'Failed to update' });
  }
});

/**
 * POST /api/notifications/deliveries/:id/dismiss
 * Помечает доставку закрытой без открытия (смахнули/закрыли уведомление).
 */
router.post('/deliveries/:id/dismiss', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const ok = await markNotificationDeliveryDismissed(id, memberId);
    res.json({ ok });
  } catch (e) {
    console.error('[notifications] delivery dismiss error:', e);
    res.status(500).json({ error: 'Failed to update' });
  }
});

/**
 * POST /api/notifications/deliveries/open-all
 * Помечает все непрочитанные доставки «открытыми» (когда пользователь вернулся в приложение).
 */
router.post('/deliveries/open-all', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const updated = await markAllNotificationDeliveriesOpened(memberId);
    res.json({ ok: true, updated });
  } catch (e) {
    console.error('[notifications] deliveries open-all error:', e);
    res.status(500).json({ error: 'Failed to update' });
  }
});

/**
 * POST /api/notifications/deliveries/local-reminder
 * Локальное напоминание из вкладки (useBrowserNotificationScheduler) — попадает в тот же счётчик «не открыто».
 */
router.post('/deliveries/local-reminder', requireAuthSession, async (req: Request, res: Response) => {
  const memberId = (req as AuthReq).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const ruleId = typeof req.body?.ruleId === 'string' ? req.body.ruleId.trim().slice(0, 64) : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 500) : '';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 2000) : '';
  const tag = typeof req.body?.tag === 'string' ? req.body.tag.trim().slice(0, 128) : ruleId;
  if (!ruleId || !title) {
    res.status(400).json({ error: 'ruleId and title are required' });
    return;
  }
  try {
    const id = await insertMemberNotificationDelivery({
      memberId,
      source: 'browser_scheduler',
      tag: tag || ruleId,
      title,
      body,
      payload: { ruleId },
    });
    res.status(201).json({ id });
  } catch (e) {
    console.error('[notifications] local-reminder error:', e);
    res.status(500).json({ error: 'Failed to record reminder' });
  }
});

export default router;

