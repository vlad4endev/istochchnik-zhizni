import type { Request, Response } from 'express';
import { notifyRealtime } from '../realtime/notify';
import { getSmsSettings, updateSmsSettings } from '../services/smsSettingsService';

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

export async function getSmsSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const settings = await getSmsSettings();
    res.json(settings);
  } catch (error) {
    console.error('[sms] get settings failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить SMS настройки' });
  }
}

export async function patchSmsSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as
    | {
        enabled?: unknown;
        api_id?: unknown;
        sender_name?: unknown;
        reset_secret?: unknown;
      }
    | undefined;

  if (body?.enabled !== undefined && typeof body.enabled !== 'boolean') {
    res.status(400).json({ error: 'Поле "enabled" должно быть boolean' });
    return;
  }
  if (body?.api_id !== undefined && body.api_id !== null && typeof body.api_id !== 'string') {
    res.status(400).json({ error: 'Поле "api_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.sender_name !== undefined &&
    body.sender_name !== null &&
    typeof body.sender_name !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "sender_name" должно быть строкой или null' });
    return;
  }
  if (
    body?.reset_secret !== undefined &&
    body.reset_secret !== null &&
    typeof body.reset_secret !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "reset_secret" должно быть строкой или null' });
    return;
  }

  try {
    const settings = await updateSmsSettings({
      enabled: body?.enabled as boolean | undefined,
      api_id: body?.api_id as string | null | undefined,
      sender_name: body?.sender_name as string | null | undefined,
      reset_secret: body?.reset_secret as string | null | undefined,
    });
    notifyRealtime(['admin']);
    res.json(settings);
  } catch (error) {
    console.error('[sms] patch settings failed:', error);
    res.status(500).json({ error: 'Не удалось сохранить SMS настройки' });
  }
}
