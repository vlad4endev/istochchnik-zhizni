import os from 'node:os';
import { pool } from '../../config/db';
import { getFirebaseMessaging } from '../../config/firebaseAdmin';
import { sendPush } from '../../services/pushService';
import { getTelegramSettings, sendTelegramTextToChat } from '../../services/telegramService';
import { getVapidConfig } from '../../services/vapidKeys';
import type { AlertSeverity, MonitorChannelsSummary } from '../types';
import { getCachedMonitorSettings } from './settings';

/**
 * Доставка системных оповещений администраторам.
 * Каналы:
 *  1) Web Push + FCM (`sendPush` всем активным админам);
 *  2) Telegram (личные `members.telegram_chat_id` админов + дежурный чат `telegramOpsChatId` / `MONITOR_TELEGRAM_CHAT_ID`);
 *  3) Webhook (опциональный HTTP POST JSON — совместим с Discord/Slack/Mattermost/n8n).
 * Все каналы best-effort с общим таймаутом — сбой канала никогда не роняет сервер.
 */

const NOTIFY_TOTAL_TIMEOUT_MS = 8000;
const WEBHOOK_TIMEOUT_MS = 5000;

export interface AdminTarget {
  memberId: number;
  name: string;
  telegramChatId: string | null;
}

export function selectRecipientAdmins(
  admins: AdminTarget[],
  recipientAdminIds: number[] | null,
): AdminTarget[] {
  if (recipientAdminIds === null) return admins;
  const allowed = new Set(recipientAdminIds);
  return admins.filter((a) => allowed.has(a.memberId));
}

export interface AdminRecipientInfo extends AdminTarget {
  hasPush: boolean;
  selected: boolean;
}

/** Список активных админов с признаками каналов и отметкой выбора — для экрана настроек. */
export async function listAdminRecipients(): Promise<AdminRecipientInfo[]> {
  const settings = getCachedMonitorSettings();
  const admins = await findActiveAdmins();
  const pushIds = new Set<number>();
  if (pool && admins.length > 0) {
    const ids = admins.map((a) => a.memberId);
    for (const table of ['push_subscriptions', 'fcm_tokens']) {
      try {
        const { rows } = await pool.query<{ member_id: number }>(
          `SELECT DISTINCT member_id FROM ${table} WHERE member_id = ANY($1::int[])`,
          [ids],
        );
        for (const row of rows) pushIds.add(Number(row.member_id));
      } catch {
        /* таблица может отсутствовать */
      }
    }
  }
  const selectedIds =
    settings.recipientAdminIds === null ? null : new Set(settings.recipientAdminIds);
  return admins.map((a) => ({
    ...a,
    hasPush: pushIds.has(a.memberId),
    selected: selectedIds === null ? true : selectedIds.has(a.memberId),
  }));
}

export async function findActiveAdmins(): Promise<AdminTarget[]> {
  if (!pool) return [];
  try {
    const { rows } = await pool.query<{
      id: number;
      first_name: string | null;
      last_name: string | null;
      telegram_chat_id: string | null;
    }>(
      `SELECT id, first_name, last_name, telegram_chat_id
         FROM members
        WHERE is_active = TRUE
          AND (app_role = 'admin' OR 'admin' = ANY (app_roles))`,
    );
    return rows.map((row) => ({
      memberId: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || `#${row.id}`,
      telegramChatId: row.telegram_chat_id?.trim() ? row.telegram_chat_id.trim() : null,
    }));
  } catch (error) {
    console.warn(
      '[monitor] Не удалось получить список админов:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export async function getNotificationChannelsSummary(): Promise<MonitorChannelsSummary> {
  const settings = getCachedMonitorSettings();
  const allAdmins = await findActiveAdmins();
  const admins = selectRecipientAdmins(allAdmins, settings.recipientAdminIds);
  const adminsWithTelegram = admins.filter((a) => Boolean(a.telegramChatId)).length;

  let adminsWithPush = 0;
  if (pool && admins.length > 0) {
    try {
      const ids = admins.map((a) => a.memberId);
      const { rows } = await pool.query<{ c: string }>(
        `SELECT COUNT(DISTINCT member_id)::text AS c
           FROM (
             SELECT member_id FROM push_subscriptions WHERE member_id = ANY($1::int[])
             UNION
             SELECT member_id FROM fcm_tokens WHERE member_id = ANY($1::int[])
           ) t`,
        [ids],
      );
      adminsWithPush = Number(rows[0]?.c ?? 0);
    } catch {
      try {
        const ids = admins.map((a) => a.memberId);
        const { rows } = await pool.query<{ c: string }>(
          `SELECT COUNT(DISTINCT member_id)::text AS c FROM push_subscriptions WHERE member_id = ANY($1::int[])`,
          [ids],
        );
        adminsWithPush = Number(rows[0]?.c ?? 0);
      } catch {
        adminsWithPush = 0;
      }
    }
  }

  let tgEnabled = false;
  let tgHasToken = false;
  try {
    const tg = await getTelegramSettings();
    tgEnabled = Boolean(tg.enabled);
    tgHasToken = Boolean(tg.has_bot_token);
  } catch {
    tgHasToken = Boolean(String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim());
  }

  const vapidReady = Boolean(getVapidConfig());
  let fcmReady = false;
  try {
    fcmReady = getFirebaseMessaging() != null;
  } catch {
    fcmReady = false;
  }

  const opsChat = settings.telegramOpsChatId || String(process.env.MONITOR_TELEGRAM_CHAT_ID ?? '').trim();

  return {
    telegramConfigured: Boolean(tgEnabled && tgHasToken),
    telegramEnabledInSettings: settings.notifyChannels.telegram,
    telegramOpsChatConfigured: Boolean(opsChat),
    pushConfigured: Boolean(vapidReady || fcmReady),
    vapidReady,
    fcmReady,
    webhookConfigured: Boolean(settings.notifyChannels.webhookUrl),
    adminTargets: admins.length,
    adminsTotal: allAdmins.length,
    recipientsMode: settings.recipientAdminIds === null ? 'all' : 'selected',
    adminsWithTelegram,
    adminsWithPush,
  };
}

export interface AdminNotifyOptions {
  title: string;
  body: string;
  severity: AlertSeverity;
  kind?: 'alert' | 'resolved' | 'test';
  url?: string;
  tag?: string;
}

export interface AdminNotifyResult {
  adminsFound: number;
  pushAttempted: number;
  pushSucceeded: number;
  telegramAttempted: number;
  telegramSucceeded: number;
  telegramFailed: number;
  webhookAttempted: boolean;
  webhookOk: boolean;
  errors: string[];
}

function prefixEmoji(options: AdminNotifyOptions): string {
  if (options.kind === 'resolved') return '🟢';
  if (options.kind === 'test') return '🔔';
  return options.severity === 'critical' ? '🔴' : '🟠';
}

async function sendWebhookAlert(
  webhookUrl: string,
  options: AdminNotifyOptions,
  emoji: string,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  timer.unref?.();
  const env = process.env.NODE_ENV ?? 'development';
  const host = os.hostname();
  const summaryText = `${emoji} [${env}@${host}] ${options.title}\n${options.body}`;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        // Совместимость со Slack (`text`), Discord (`content`) и кастомными обработчиками.
        text: summaryText,
        content: summaryText,
        title: options.title,
        body: options.body,
        severity: options.severity,
        kind: options.kind ?? 'alert',
        env,
        host,
        timestamp: new Date().toISOString(),
        url: options.url ?? '/admin?tab=diagnostics',
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Отправляет оповещение по всем включённым каналам. Никогда не бросает исключений. */
export async function notifyAdmins(options: AdminNotifyOptions): Promise<AdminNotifyResult> {
  const settings = getCachedMonitorSettings();
  const emoji = prefixEmoji(options);
  const env = process.env.NODE_ENV ?? 'development';
  const host = os.hostname();

  const result: AdminNotifyResult = {
    adminsFound: 0,
    pushAttempted: 0,
    pushSucceeded: 0,
    telegramAttempted: 0,
    telegramSucceeded: 0,
    telegramFailed: 0,
    webhookAttempted: false,
    webhookOk: false,
    errors: [],
  };

  const overall = (async () => {
    const admins = selectRecipientAdmins(await findActiveAdmins(), settings.recipientAdminIds);
    result.adminsFound = admins.length;
    const jobs: Promise<void>[] = [];

    if (settings.notifyChannels.push) {
      for (const admin of admins) {
        result.pushAttempted += 1;
        jobs.push(
          sendPush(
            admin.memberId,
            `${emoji} ${options.title}`,
            options.body,
            {
              type: 'system_alert',
              severity: options.severity,
              url: options.url ?? '/admin?tab=diagnostics',
              ...(options.tag ? { tag: options.tag } : {}),
            },
            { bypassRoleFilter: true },
          )
            .then((summary) => {
              if (summary.web.sent > 0 || summary.fcm.sent > 0) {
                result.pushSucceeded += 1;
              }
            })
            .catch((error) => {
              result.errors.push(
                `push → ${admin.name}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }),
        );
      }
    }

    if (settings.notifyChannels.telegram) {
      const opsChatId =
        settings.telegramOpsChatId || String(process.env.MONITOR_TELEGRAM_CHAT_ID ?? '').trim();
      const telegramChats = new Set<string>();
      for (const admin of admins) {
        if (admin.telegramChatId) telegramChats.add(admin.telegramChatId);
      }
      if (opsChatId) telegramChats.add(opsChatId);

      const telegramText = [
        `🛡 Источник жизни — мониторинг (${env})`,
        `${emoji} ${options.title}`,
        '',
        options.body,
        '',
        `Узел: ${host}`,
      ].join('\n');

      for (const chatId of telegramChats) {
        result.telegramAttempted += 1;
        jobs.push(
          sendTelegramTextToChat(chatId, telegramText)
            .then((sent) => {
              if (sent.ok) {
                result.telegramSucceeded += 1;
              } else {
                result.telegramFailed += 1;
                result.errors.push(`telegram → ${chatId}: HTTP ${sent.status}`);
              }
            })
            .catch((error) => {
              result.telegramFailed += 1;
              const message = error instanceof Error ? error.message : String(error);
              if (message !== 'telegram_disabled') {
                result.errors.push(`telegram → ${chatId}: ${message}`);
              }
            }),
        );
      }
    }

    if (settings.notifyChannels.webhookUrl) {
      result.webhookAttempted = true;
      jobs.push(
        sendWebhookAlert(settings.notifyChannels.webhookUrl, options, emoji).then((wh) => {
          result.webhookOk = wh.ok;
          if (!wh.ok && wh.error) {
            result.errors.push(`webhook: ${wh.error}`);
          }
        }),
      );
    }

    await Promise.allSettled(jobs);
    return result;
  })();

  const timeout = new Promise<AdminNotifyResult>((resolve) => {
    const timer = setTimeout(() => {
      result.errors.push('Доставка превысила общий таймаут 8с — часть каналов могла не успеть');
      resolve(result);
    }, NOTIFY_TOTAL_TIMEOUT_MS);
    timer.unref?.();
  });

  return Promise.race([overall, timeout]);
}

/** Тестовая отправка для кнопки «Проверить оповещения» в админке. */
export async function sendTestAlertToAdmins(): Promise<AdminNotifyResult> {
  return notifyAdmins({
    title: 'Тестовое оповещение мониторинга',
    body: `Проверка каналов доставки выполнена в ${new Date().toLocaleTimeString('ru-RU')}. Если вы получили это сообщение — оповещения об ошибках и сбоях работают.`,
    severity: 'warning',
    kind: 'test',
    url: '/admin?tab=diagnostics',
    tag: 'system-alert-test',
  });
}
