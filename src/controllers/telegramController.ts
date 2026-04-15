import type { Request, Response } from 'express';
import {
  buildNextWeekPlanTelegramText,
  buildTodayPrayerTelegramText,
  getTelegramSettings,
  sendTelegramByPurpose,
  updateTelegramSettings,
} from '../services/telegramService';
import { notifyRealtime } from '../realtime/notify';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string };

function ensureAdmin(req: Request, res: Response): AuthRequest | null {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return null;
  }
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  return r;
}

function errorToStatus(error: unknown): { status: number; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'telegram_disabled') return { status: 409, message: 'Telegram модуль выключен в настройках' };
  if (msg === 'telegram_missing_token') return { status: 400, message: 'Не задан Telegram Bot Token' };
  if (msg === 'telegram_missing_chat') return { status: 400, message: 'Не задан Telegram chat_id' };
  if (msg === 'telegram_empty_text') return { status: 400, message: 'Текст сообщения пуст' };
  if (msg.startsWith('telegram_send_failed:')) {
    return { status: 502, message: 'Telegram API вернул ошибку при отправке' };
  }
  return { status: 500, message: 'Внутренняя ошибка Telegram модуля' };
}

export async function getTelegramSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const settings = await getTelegramSettings();
    res.json(settings);
  } catch (error) {
    console.error('[telegram] get settings failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить Telegram настройки' });
  }
}

export async function patchTelegramSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as
    | {
        enabled?: unknown;
        bot_token?: unknown;
        prayer_chat_id?: unknown;
        coordinator_chat_id?: unknown;
        default_chat_id?: unknown;
        prayer_template?: unknown;
      }
    | undefined;

  if (body?.enabled !== undefined && typeof body.enabled !== 'boolean') {
    res.status(400).json({ error: 'Поле "enabled" должно быть boolean' });
    return;
  }
  if (body?.bot_token !== undefined && body.bot_token !== null && typeof body.bot_token !== 'string') {
    res.status(400).json({ error: 'Поле "bot_token" должно быть строкой или null' });
    return;
  }
  if (
    body?.prayer_chat_id !== undefined &&
    body.prayer_chat_id !== null &&
    typeof body.prayer_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "prayer_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.coordinator_chat_id !== undefined &&
    body.coordinator_chat_id !== null &&
    typeof body.coordinator_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "coordinator_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.default_chat_id !== undefined &&
    body.default_chat_id !== null &&
    typeof body.default_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "default_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.prayer_template !== undefined &&
    body.prayer_template !== null &&
    typeof body.prayer_template !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "prayer_template" должно быть строкой или null' });
    return;
  }

  try {
    const settings = await updateTelegramSettings({
      enabled: body?.enabled as boolean | undefined,
      bot_token: body?.bot_token as string | null | undefined,
      prayer_chat_id: body?.prayer_chat_id as string | null | undefined,
      coordinator_chat_id: body?.coordinator_chat_id as string | null | undefined,
      default_chat_id: body?.default_chat_id as string | null | undefined,
      prayer_template: body?.prayer_template as string | null | undefined,
    });
    notifyRealtime(['admin']);
    res.json(settings);
  } catch (error) {
    console.error('[telegram] patch settings failed:', error);
    res.status(500).json({ error: 'Не удалось сохранить Telegram настройки' });
  }
}

export async function postTelegramSendHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { kind?: unknown; text?: unknown; chat_id?: unknown } | undefined;
  const kind = typeof body?.kind === 'string' ? body.kind.trim() : '';
  const chatIdOverride = typeof body?.chat_id === 'string' ? body.chat_id.trim() : null;

  if (kind !== 'prayer_today' && kind !== 'next_week' && kind !== 'custom') {
    res.status(400).json({ error: 'Поле "kind" должно быть: prayer_today | next_week | custom' });
    return;
  }
  if (kind === 'custom' && typeof body?.text !== 'string') {
    res.status(400).json({ error: 'Для kind=custom требуется строка в поле "text"' });
    return;
  }

  try {
    const text =
      kind === 'prayer_today'
        ? await buildTodayPrayerTelegramText()
        : kind === 'next_week'
          ? await buildNextWeekPlanTelegramText()
          : (body?.text as string);

    const purpose = kind === 'next_week' ? 'coordinator' : kind === 'custom' ? 'default' : 'prayer';
    const sent = await sendTelegramByPurpose({
      purpose,
      text,
      chatIdOverride,
    });

    res.json({
      ok: true,
      kind,
      chat_id: sent.chat_id,
    });
  } catch (error) {
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}
