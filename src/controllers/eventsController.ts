import type { Request, Response } from 'express';

function pgErrorMeta(err: unknown): { db_code?: string; db_column?: string; db_constraint?: string } {
  if (!err || typeof err !== 'object') return {};
  const o = err as Record<string, unknown>;
  const out: { db_code?: string; db_column?: string; db_constraint?: string } = {};
  if (typeof o.code === 'string') out.db_code = o.code;
  if (typeof o.column === 'string') out.db_column = o.column;
  if (typeof o.constraint === 'string') out.db_constraint = o.constraint;
  return out;
}
import {
  createChurchEvent,
  deleteAllChurchEvents,
  deleteChurchEvent,
  listActiveEvents,
  listAllEventsAdmin,
  updateChurchEvent,
} from '../services/eventsService';
import { notifyRealtime } from '../realtime/notify';

type AuthReq = Request & { authUserRole?: 'member' | 'admin' };

function ensureAdmin(req: Request, res: Response): AuthReq | null {
  const authReq = req as AuthReq;
  if (authReq.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  return authReq;
}

function parseId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function isValidDateInput(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isValidTimeInput(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  const m = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(t);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(min) || min < 0 || min > 59) return false;
  if (m[3] !== undefined) {
    const s = Number(m[3]);
    if (!Number.isInteger(s) || s < 0 || s > 59) return false;
  }
  return true;
}

function isValidRecurrenceType(value: unknown): value is 'once' | 'weekly' {
  return value === 'once' || value === 'weekly';
}

function parseWeeklyDay(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

export async function getActiveEvents(_req: Request, res: Response): Promise<void> {
  try {
    const items = await listActiveEvents();
    res.json(items);
  } catch (err) {
    console.error('getActiveEvents error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getAdminEvents(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const items = await listAllEventsAdmin();
    res.json(items);
  } catch (err) {
    console.error('getAdminEvents error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postEvent(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description : null;
  const eventDate = req.body?.event_date;
  const eventTime = typeof req.body?.event_time === 'string' ? req.body.event_time.trim() : '';
  const recurrenceType = req.body?.recurrence_type;
  const weeklyDay = req.body?.weekly_day;
  const isActive = req.body?.is_active;

  if (!title) {
    res.status(400).json({ error: 'Field "title" is required' });
    return;
  }
  if (!isValidRecurrenceType(recurrenceType)) {
    res.status(400).json({ error: 'Field "recurrence_type" must be "once" or "weekly"' });
    return;
  }
  if (!isValidDateInput(eventDate)) {
    res.status(400).json({ error: 'Field "event_date" must be YYYY-MM-DD' });
    return;
  }
  if (!isValidTimeInput(eventTime)) {
    res.status(400).json({ error: 'Field "event_time" must be HH:mm' });
    return;
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'Field "is_active" must be boolean' });
    return;
  }
  if (recurrenceType === 'weekly' && parseWeeklyDay(weeklyDay) == null) {
    res.status(400).json({ error: 'Field "weekly_day" must be 0..6 for weekly events' });
    return;
  }

  try {
    const created = await createChurchEvent({
      title,
      description,
      event_date: eventDate,
      event_time: eventTime,
      recurrence_type: recurrenceType,
      weekly_day: recurrenceType === 'weekly' ? parseWeeklyDay(weeklyDay) : null,
      is_active: typeof isActive === 'boolean' ? isActive : true,
    });
    notifyRealtime(['calendar']);
    res.status(201).json(created);
  } catch (err) {
    console.error('postEvent error', err);
    res.status(500).json({ error: 'Database error', ...pgErrorMeta(err) });
  }
}

export async function patchEvent(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid event id' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
    res.status(400).json({ error: 'Field "title" must be non-empty string' });
    return;
  }
  if (body.event_date !== undefined && !isValidDateInput(body.event_date)) {
    res.status(400).json({ error: 'Field "event_date" must be YYYY-MM-DD' });
    return;
  }
  if (body.event_time !== undefined && !isValidTimeInput(body.event_time)) {
    res.status(400).json({ error: 'Field "event_time" must be HH:mm' });
    return;
  }
  if (body.recurrence_type !== undefined && !isValidRecurrenceType(body.recurrence_type)) {
    res.status(400).json({ error: 'Field "recurrence_type" must be "once" or "weekly"' });
    return;
  }
  if (body.weekly_day !== undefined && parseWeeklyDay(body.weekly_day) == null) {
    res.status(400).json({ error: 'Field "weekly_day" must be 0..6' });
    return;
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    res.status(400).json({ error: 'Field "is_active" must be boolean' });
    return;
  }

  try {
    const updated = await updateChurchEvent(id, {
      title: typeof body.title === 'string' ? body.title : undefined,
      description:
        body.description === undefined
          ? undefined
          : typeof body.description === 'string'
            ? body.description
            : null,
      event_date: typeof body.event_date === 'string' ? body.event_date : undefined,
      event_time: typeof body.event_time === 'string' ? body.event_time : undefined,
      recurrence_type: isValidRecurrenceType(body.recurrence_type) ? body.recurrence_type : undefined,
      weekly_day: body.weekly_day !== undefined ? parseWeeklyDay(body.weekly_day) : undefined,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    notifyRealtime(['calendar']);
    res.json(updated);
  } catch (err) {
    console.error('patchEvent error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteEvent(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid event id' });
    return;
  }
  try {
    const deleted = await deleteChurchEvent(id);
    if (!deleted) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    notifyRealtime(['calendar']);
    res.status(204).send();
  } catch (err) {
    console.error('deleteEvent error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteAllEvents(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const deletedCount = await deleteAllChurchEvents();
    notifyRealtime(['calendar']);
    res.json({ ok: true, deleted: deletedCount });
  } catch (err) {
    console.error('deleteAllEvents error', err);
    res.status(500).json({ error: 'Database error' });
  }
}
