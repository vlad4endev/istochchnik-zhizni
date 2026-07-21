import type { Request, Response } from 'express';

import { ensureMySermonsAccess } from '../utils/sermonNotesAccess';
import {
  createSermonNote,
  deleteSermonNote,
  getSermonNote,
  listSermonNotes,
  updateSermonNote,
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
    const body = req.body as {
      title?: string;
      topic?: string;
      scripture?: string;
      body?: string;
    };
    const note = await createSermonNote(r.authUserId!, {
      title: typeof body.title === 'string' ? body.title : undefined,
      topic: typeof body.topic === 'string' ? body.topic : undefined,
      scripture: typeof body.scripture === 'string' ? body.scripture : undefined,
      body: typeof body.body === 'string' ? body.body : undefined,
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
    const body = req.body as {
      title?: string;
      topic?: string;
      scripture?: string;
      body?: string;
    };
    const patch: { title?: string; topic?: string; scripture?: string; body?: string } = {};
    if (typeof body.title === 'string') patch.title = body.title;
    if (typeof body.topic === 'string') patch.topic = body.topic;
    if (typeof body.scripture === 'string') patch.scripture = body.scripture;
    if (typeof body.body === 'string') patch.body = body.body;
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
