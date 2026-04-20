import type { Request, Response } from 'express';
import { notifyRealtime } from '../realtime/notify';
import {
  APP_SECTION_IDS,
  APP_ROLE_IDS,
  type AppSectionId,
  type AppRole,
} from '../types/sectionVisibilitySettings';
import {
  loadSectionVisibilitySettings,
  patchSectionVisibilitySettings,
  type SectionVisibilityPatch,
} from '../services/sectionVisibilitySettingsService';

type AuthRequest = Request & { authUserRole?: string };

function ensureAdmin(req: Request, res: Response): boolean {
  const role = ((req as AuthRequest).authUserRole ?? '').trim().toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Только администратор может менять видимость разделов.' });
    return false;
  }
  return true;
}

export async function getSectionVisibilitySettingsPublic(_req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadSectionVisibilitySettings();
    res.json(doc);
  } catch (e) {
    console.error('[section-visibility] GET public error', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки разделов' });
  }
}

export async function getSectionVisibilitySettingsAdmin(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const doc = await loadSectionVisibilitySettings();
    res.json({
      ...doc,
      role_options: APP_ROLE_IDS.map((id) => ({ id, label: id })),
      section_options: APP_SECTION_IDS.map((id) => ({ id, label: id })),
    });
  } catch (e) {
    console.error('[section-visibility] GET admin error', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки разделов' });
  }
}

function isAppSectionId(input: string): input is AppSectionId {
  return (APP_SECTION_IDS as readonly string[]).includes(input);
}

function isAppRole(input: string): input is AppRole {
  return (APP_ROLE_IDS as readonly string[]).includes(input);
}

export async function patchSectionVisibilitySettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { sections?: unknown } | null;
  if (!body || typeof body !== 'object' || !body.sections || typeof body.sections !== 'object') {
    res.status(400).json({ error: 'Ожидался объект { sections: { ... } }' });
    return;
  }

  const rawSections = body.sections as Record<string, unknown>;
  const patch: SectionVisibilityPatch = {};
  for (const key of Object.keys(rawSections)) {
    if (!isAppSectionId(key)) {
      res.status(400).json({ error: `Неизвестный раздел: ${key}` });
      return;
    }
    const raw = rawSections[key];
    if (!raw || typeof raw !== 'object') {
      res.status(400).json({ error: `Некорректные настройки для раздела: ${key}` });
      return;
    }
    const one = raw as { enabled?: unknown; roles?: unknown };
    const out: { enabled?: boolean; roles?: AppRole[] } = {};
    if (one.enabled !== undefined) {
      if (typeof one.enabled !== 'boolean') {
        res.status(400).json({ error: `Поле enabled должно быть boolean (раздел: ${key})` });
        return;
      }
      out.enabled = one.enabled;
    }
    if (one.roles !== undefined) {
      if (!Array.isArray(one.roles)) {
        res.status(400).json({ error: `Поле roles должно быть массивом строк (раздел: ${key})` });
        return;
      }
      const roles: AppRole[] = [];
      for (const item of one.roles) {
        if (typeof item !== 'string' || !isAppRole(item)) {
          res.status(400).json({ error: `Неизвестная роль в разделе ${key}` });
          return;
        }
        if (!roles.includes(item)) {
          roles.push(item);
        }
      }
      out.roles = roles;
    }
    patch[key] = out;
  }

  try {
    const doc = await patchSectionVisibilitySettings(patch);
    notifyRealtime(['admin']);
    res.json(doc);
  } catch (e) {
    console.error('[section-visibility] PATCH error', e);
    res.status(500).json({ error: 'Не удалось сохранить настройки разделов' });
  }
}
