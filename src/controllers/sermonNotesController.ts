import type { Request, Response } from 'express';

import { ensureMySermonsAccess } from '../utils/sermonNotesAccess';
import {
  createSermonNote,
  deleteSermonNote,
  getSermonNote,
  listSermonNotes,
  updateSermonNote,
  updateSermonNoteShare,
} from '../services/sermonNotesService';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
};

function parseNoteId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function sermonNotesList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureMySermonsAccess(r, res))) return;
    res.json(await listSermonNotes(r.authUserId!));
  } catch (e) {
    console.error('[sermon-notes] list:', e);
    res.status(500).json({ error: 'Не удалось загрузить конспекты' });
  }
}

export async function sermonNotesCreate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureMySermonsAccess(r, res))) return;
    const payload = req.body as {
      title?: string;
      topic?: string;
      scripture?: string;
      body?: string;
      body_format?: string;
      service_plan_id?: unknown;
    };
    let servicePlanId: number | null | undefined;
    if (payload.service_plan_id === null) servicePlanId = null;
    else if (
      typeof payload.service_plan_id === 'number' &&
      Number.isInteger(payload.service_plan_id) &&
      payload.service_plan_id > 0
    ) {
      servicePlanId = payload.service_plan_id;
    } else if (typeof payload.service_plan_id === 'string' && /^\d+$/.test(payload.service_plan_id)) {
      servicePlanId = Number(payload.service_plan_id);
    }
    const note = await createSermonNote(r.authUserId!, {
      title: typeof payload.title === 'string' ? payload.title : undefined,
      topic: typeof payload.topic === 'string' ? payload.topic : undefined,
      scripture: typeof payload.scripture === 'string' ? payload.scripture : undefined,
      body: typeof payload.body === 'string' ? payload.body : undefined,
      body_format: payload.body_format === 'plain' ? 'plain' : 'html',
      service_plan_id: servicePlanId,
    });
    res.status(201).json(note);
  } catch (e) {
    console.error('[sermon-notes] create:', e);
    res.status(500).json({ error: 'Не удалось создать конспект' });
  }
}

export async function sermonNotesGet(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureMySermonsAccess(r, res))) return;
    const id = parseNoteId(String(req.params.id ?? ''));
    if (id == null) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    const note = await getSermonNote(r.authUserId!, id);
    if (!note) {
      res.status(404).json({ error: 'Конспект не найден' });
      return;
    }
    res.json(note);
  } catch (e) {
    console.error('[sermon-notes] get:', e);
    res.status(500).json({ error: 'Не удалось загрузить конспект' });
  }
}

export async function sermonNotesUpdate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureMySermonsAccess(r, res))) return;
    const id = parseNoteId(String(req.params.id ?? ''));
    if (id == null) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    const payload = req.body as {
      title?: string;
      topic?: string;
      scripture?: string;
      body?: string;
      body_format?: string;
      service_plan_id?: unknown;
    };
    const patch: {
      title?: string;
      topic?: string;
      scripture?: string;
      body?: string;
      body_format?: 'plain' | 'html';
      service_plan_id?: number | null;
    } = {};
    if (typeof payload.title === 'string') patch.title = payload.title;
    if (typeof payload.topic === 'string') patch.topic = payload.topic;
    if (typeof payload.scripture === 'string') patch.scripture = payload.scripture;
    if (typeof payload.body === 'string') patch.body = payload.body;
    if (payload.body_format === 'plain' || payload.body_format === 'html') {
      patch.body_format = payload.body_format;
    }
    if (payload.service_plan_id === null) {
      patch.service_plan_id = null;
    } else if (
      typeof payload.service_plan_id === 'number' &&
      Number.isInteger(payload.service_plan_id) &&
      payload.service_plan_id > 0
    ) {
      patch.service_plan_id = payload.service_plan_id;
    } else if (typeof payload.service_plan_id === 'string' && /^\d+$/.test(payload.service_plan_id)) {
      patch.service_plan_id = Number(payload.service_plan_id);
    }
    const updated = await updateSermonNote(r.authUserId!, id, patch);
    if (!updated) {
      res.status(404).json({ error: 'Конспект не найден' });
      return;
    }
    res.json(updated);
  } catch (e) {
    console.error('[sermon-notes] update:', e);
    res.status(500).json({ error: 'Не удалось сохранить конспект' });
  }
}

export async function sermonNotesDelete(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureMySermonsAccess(r, res))) return;
    const id = parseNoteId(String(req.params.id ?? ''));
    if (id == null) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    const ok = await deleteSermonNote(r.authUserId!, id);
    if (!ok) {
      res.status(404).json({ error: 'Конспект не найден' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[sermon-notes] delete:', e);
    res.status(500).json({ error: 'Не удалось удалить конспект' });
  }
}

export async function sermonNotesShare(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureMySermonsAccess(r, res))) return;
    const id = parseNoteId(String(req.params.id ?? ''));
    if (id == null) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    const payload = req.body as { is_public?: unknown; rotate_token?: unknown };
    if (typeof payload.is_public !== 'boolean') {
      res.status(400).json({ error: 'Укажите is_public: true|false' });
      return;
    }
    const updated = await updateSermonNoteShare(r.authUserId!, id, {
      is_public: payload.is_public,
      rotate_token: payload.rotate_token === true,
    });
    if (!updated) {
      res.status(404).json({ error: 'Конспект не найден' });
      return;
    }
    res.json(updated);
  } catch (e) {
    console.error('[sermon-notes] share:', e);
    res.status(500).json({ error: 'Не удалось обновить доступ по ссылке' });
  }
}
