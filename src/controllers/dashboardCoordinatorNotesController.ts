import { Request, Response } from 'express';

import { notifyRealtime } from '../realtime/notify';
import {
  deleteCoordinatorNote,
  getCoordinatorNotesManageSnapshot,
  getCoordinatorNotesVisibleOnDate,
  memberIsAdminOrCollectionCoordinator,
  upsertCoordinatorNote,
  type DurationPreset,
  type NoteKind,
} from '../services/dashboardCoordinatorNotesService';

type AuthReq = Request & { authUserId?: number };

function isValidYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isNoteKind(value: unknown): value is NoteKind {
  return value === 'urgent_prayer' || value === 'announcement';
}

function isDurationPreset(value: unknown): value is DurationPreset {
  return value === 'day' || value === 'week' || value === 'month';
}

export async function getDashboardCoordinatorNotes(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthReq;
    if (!authReq.authUserId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const scope = typeof req.query.scope === 'string' ? req.query.scope.trim() : '';
    if (scope === 'manage') {
      const ok = await memberIsAdminOrCollectionCoordinator(authReq.authUserId);
      if (!ok) {
        res.status(403).json({ error: 'Доступно администратору и координаторам сбора нужд.' });
        return;
      }
      const data = await getCoordinatorNotesManageSnapshot();
      res.json(data);
      return;
    }

    const raw = req.query.for_date ?? req.query.date;
    const forDate = isValidYmd(raw) ? raw : new Date().toISOString().slice(0, 10);
    const data = await getCoordinatorNotesVisibleOnDate(forDate);
    res.json(data);
  } catch (err) {
    console.error('[dashboardCoordinatorNotes] get', err);
    res.status(500).json({ error: 'Database error' });
  }
}

function noteKindFromParam(param: string | undefined): NoteKind | null {
  if (param === 'urgent_prayer' || param === 'announcement') return param;
  return null;
}

export async function deleteDashboardCoordinatorNote(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthReq;
    const memberId = authReq.authUserId;
    if (!memberId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const ok = await memberIsAdminOrCollectionCoordinator(memberId);
    if (!ok) {
      res.status(403).json({ error: 'Доступно администратору и координаторам сбора нужд.' });
      return;
    }

    const kind = noteKindFromParam(req.params.kind);
    if (!kind) {
      res.status(400).json({ error: 'Invalid kind' });
      return;
    }

    await deleteCoordinatorNote(kind);
    notifyRealtime(['coordinator-notes']);

    const raw = req.query.for_date ?? req.query.date;
    const forDate = isValidYmd(raw) ? raw : new Date().toISOString().slice(0, 10);
    const data = await getCoordinatorNotesVisibleOnDate(forDate);
    res.json(data);
  } catch (err) {
    console.error('[dashboardCoordinatorNotes] delete', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postDashboardCoordinatorNote(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthReq;
    const memberId = authReq.authUserId;
    if (!memberId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const ok = await memberIsAdminOrCollectionCoordinator(memberId);
    if (!ok) {
      res.status(403).json({ error: 'Доступно администратору и координаторам сбора нужд.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const kind = body.kind;
    const text = typeof body.text === 'string' ? body.text : '';
    const duration = body.duration;
    const todayKey = body.today_key;

    if (!isNoteKind(kind)) {
      res.status(400).json({ error: 'Invalid kind' });
      return;
    }
    if (!isDurationPreset(duration)) {
      res.status(400).json({ error: 'Invalid duration' });
      return;
    }
    const todayYmd = isValidYmd(todayKey) ? todayKey : new Date().toISOString().slice(0, 10);

    if (text.length > 8000) {
      res.status(400).json({ error: 'Текст слишком длинный.' });
      return;
    }

    await upsertCoordinatorNote(memberId, kind, text, duration, todayYmd);
    notifyRealtime(['coordinator-notes']);
    const data = await getCoordinatorNotesVisibleOnDate(todayYmd);
    res.json(data);
  } catch (err) {
    console.error('[dashboardCoordinatorNotes] post', err);
    res.status(500).json({ error: 'Database error' });
  }
}
