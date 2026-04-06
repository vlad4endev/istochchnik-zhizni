import type { Request, Response } from 'express';
import {
  type NotificationSettingsDocument,
  normalizeNotificationSettingsDocument,
  publicNotificationPayload,
} from '../types/notificationSettings';
import { loadNotificationSettings, saveNotificationSettings } from '../services/notificationSettingsService';
import { notifyRealtime } from '../realtime/notify';

type AuthRequest = Request & { authUserRole?: string };

function ensureAdmin(req: Request, res: Response): boolean {
  const r = req as AuthRequest;
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Только администратор может менять настройки уведомлений.' });
    return false;
  }
  return true;
}

export async function getNotificationSettingsPublic(_req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadNotificationSettings();
    res.json(publicNotificationPayload(doc));
  } catch (e) {
    console.error('[notification-settings] GET error', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки уведомлений' });
  }
}

export async function getNotificationSettingsAdmin(_req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(_req, res)) return;
  try {
    const doc = await loadNotificationSettings();
    res.json(doc);
  } catch (e) {
    console.error('[notification-settings] GET admin error', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки уведомлений' });
  }
}

export async function patchNotificationSettings(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const body = req.body as { timezone?: unknown; rules?: unknown } | null;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Ожидался объект с полями timezone и rules' });
      return;
    }

    const current = await loadNotificationSettings();
    const mergedRaw: NotificationSettingsDocument = {
      ...current,
      timezone:
        typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : current.timezone,
      rules: current.rules,
      runtimeState: current.runtimeState,
    };

    if (Array.isArray(body.rules)) {
      const normalized = normalizeNotificationSettingsDocument({
        ...mergedRaw,
        rules: body.rules,
      });
      mergedRaw.rules = normalized.rules;
    }

    const out = normalizeNotificationSettingsDocument({
      ...mergedRaw,
      runtimeState: current.runtimeState,
    });

    await saveNotificationSettings(out);
    notifyRealtime(['notification-settings']);
    res.json(publicNotificationPayload(out));
  } catch (e) {
    console.error('[notification-settings] PATCH error', e);
    res.status(500).json({ error: 'Не удалось сохранить настройки уведомлений' });
  }
}
