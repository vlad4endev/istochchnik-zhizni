import type { Request, Response } from 'express';

import {
  getCallSettingsAdmin,
  updateCallSettings,
  type CallSettingsPatch,
} from '../services/callSettingsService';
import { getCallUsageStats } from '../services/callStatsService';
import {
  CALL_END_REASON_IDS,
  CALL_PARTICIPANT_STATUS_IDS,
  CALL_STATUS_IDS,
  type CallEndReasonId,
  type CallParticipantStatusId,
  type CallStatusId,
} from '../types/callSettings';
import { APP_ROLE_IDS, type AppRole } from '../types/sectionVisibilitySettings';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string };

function ensureAdmin(req: Request, res: Response): boolean {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Только администратор может менять настройки звонков' });
    return false;
  }
  return true;
}

function optionalIntOrNull(
  raw: unknown,
  field: string,
  res: Response,
): { ok: true; value: number | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '') return { ok: true, value: null };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    res.status(400).json({ error: `Поле ${field} должно быть числом или null` });
    return { ok: false };
  }
  return { ok: true, value: Math.floor(n) };
}

export async function getCallSettingsAdminHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const view = await getCallSettingsAdmin({ probe: true });
    res.json(view);
  } catch (e) {
    console.error('[call-settings] GET admin error', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки звонков' });
  }
}

export async function patchCallSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Ожидался JSON-объект с полями настроек' });
    return;
  }

  const patch: CallSettingsPatch = {};

  if (body.enabled !== undefined) {
    if (body.enabled !== null && typeof body.enabled !== 'boolean') {
      res.status(400).json({ error: 'Поле enabled: boolean или null (наследовать env)' });
      return;
    }
    patch.enabled = body.enabled as boolean | null;
  }

  if (body.livekit_api_key !== undefined) {
    if (body.livekit_api_key !== null && typeof body.livekit_api_key !== 'string') {
      res.status(400).json({ error: 'Поле livekit_api_key: строка или null' });
      return;
    }
    patch.livekit_api_key = body.livekit_api_key as string | null;
  }
  if (body.livekit_api_secret !== undefined) {
    if (body.livekit_api_secret !== null && typeof body.livekit_api_secret !== 'string') {
      res.status(400).json({ error: 'Поле livekit_api_secret: строка или null' });
      return;
    }
    patch.livekit_api_secret = body.livekit_api_secret as string | null;
  }
  if (body.clear_livekit_api_key === true) patch.clear_livekit_api_key = true;
  if (body.clear_livekit_api_secret === true) patch.clear_livekit_api_secret = true;

  if (body.livekit_internal_url !== undefined) {
    if (body.livekit_internal_url !== null && typeof body.livekit_internal_url !== 'string') {
      res.status(400).json({ error: 'Поле livekit_internal_url: строка или null' });
      return;
    }
    patch.livekit_internal_url = body.livekit_internal_url as string | null;
  }
  if (body.livekit_public_url !== undefined) {
    if (body.livekit_public_url !== null && typeof body.livekit_public_url !== 'string') {
      res.status(400).json({ error: 'Поле livekit_public_url: строка или null' });
      return;
    }
    patch.livekit_public_url = body.livekit_public_url as string | null;
  }

  for (const key of [
    'ring_timeout_sec',
    'token_ttl_sec',
    'invite_ttl_hours',
    'max_group_participants',
    'ghost_grace_sec',
    'ghost_miss_ticks',
  ] as const) {
    const parsed = optionalIntOrNull(body[key], key, res);
    if (!parsed.ok) return;
    if (parsed.value !== undefined) {
      patch[key] = parsed.value;
    }
  }

  if (body.features !== undefined) {
    if (!body.features || typeof body.features !== 'object') {
      res.status(400).json({ error: 'Поле features должно быть объектом' });
      return;
    }
    const f = body.features as Record<string, unknown>;
    patch.features = {};
    for (const k of ['direct_calls', 'group_calls', 'link_meetings', 'audio', 'video'] as const) {
      if (f[k] !== undefined) {
        if (typeof f[k] !== 'boolean') {
          res.status(400).json({ error: `features.${k} должно быть boolean` });
          return;
        }
        patch.features[k] = f[k] as boolean;
      }
    }
  }

  if (body.allowed_roles !== undefined) {
    if (!Array.isArray(body.allowed_roles)) {
      res.status(400).json({ error: 'Поле allowed_roles должно быть массивом ролей' });
      return;
    }
    const roles: AppRole[] = [];
    for (const item of body.allowed_roles) {
      const v = typeof item === 'string' ? item.trim().toLowerCase() : '';
      if (!(APP_ROLE_IDS as readonly string[]).includes(v)) {
        res.status(400).json({ error: `Неизвестная роль: ${String(item)}` });
        return;
      }
      if (!roles.includes(v as AppRole)) roles.push(v as AppRole);
    }
    if (roles.length === 0) {
      res.status(400).json({ error: 'Выберите хотя бы одну роль' });
      return;
    }
    patch.allowed_roles = roles;
  }

  if (body.status_labels !== undefined) {
    if (!body.status_labels || typeof body.status_labels !== 'object') {
      res.status(400).json({ error: 'Поле status_labels должно быть объектом' });
      return;
    }
    const sl = body.status_labels as Record<string, unknown>;
    patch.status_labels = {};

    const parseMap = <T extends string>(
      raw: unknown,
      allowed: readonly T[],
      field: string,
    ): Partial<Record<T, string | null>> | null => {
      if (raw === undefined) return null;
      if (!raw || typeof raw !== 'object') {
        res.status(400).json({ error: `${field} должно быть объектом` });
        return null;
      }
      const out: Partial<Record<T, string | null>> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!(allowed as readonly string[]).includes(k)) continue;
        if (v === null || v === '') {
          out[k as T] = null;
        } else if (typeof v === 'string') {
          out[k as T] = v;
        } else {
          res.status(400).json({ error: `${field}.${k}: строка или null` });
          return null;
        }
      }
      return out;
    };

    const callLabels = parseMap(sl.call, CALL_STATUS_IDS, 'status_labels.call');
    if (sl.call !== undefined && callLabels === null) return;
    if (callLabels) patch.status_labels.call = callLabels as Partial<Record<CallStatusId, string | null>>;

    const partLabels = parseMap(sl.participant, CALL_PARTICIPANT_STATUS_IDS, 'status_labels.participant');
    if (sl.participant !== undefined && partLabels === null) return;
    if (partLabels) {
      patch.status_labels.participant = partLabels as Partial<
        Record<CallParticipantStatusId, string | null>
      >;
    }

    const reasonLabels = parseMap(sl.end_reason, CALL_END_REASON_IDS, 'status_labels.end_reason');
    if (sl.end_reason !== undefined && reasonLabels === null) return;
    if (reasonLabels) {
      patch.status_labels.end_reason = reasonLabels as Partial<Record<CallEndReasonId, string | null>>;
    }
  }

  try {
    const view = await updateCallSettings(patch);
    res.json(view);
  } catch (e) {
    console.error('[call-settings] PATCH error', e);
    res.status(500).json({ error: 'Не удалось сохранить настройки звонков' });
  }
}

export async function getCallUsageStatsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const memberIdRaw = req.query.memberId ?? req.query.member_id;
    const memberId =
      memberIdRaw != null && String(memberIdRaw).trim() !== ''
        ? Number(memberIdRaw)
        : undefined;
    const limitRaw = req.query.limit;
    const limit = limitRaw != null ? Number(limitRaw) : undefined;

    const stats = await getCallUsageStats({
      from,
      to,
      status,
      memberId: Number.isFinite(memberId) ? memberId : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json(stats);
  } catch (e) {
    console.error('[call-stats] GET error', e);
    res.status(500).json({ error: 'Не удалось загрузить статистику звонков' });
  }
}
