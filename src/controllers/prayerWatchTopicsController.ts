import { Request, Response } from 'express';

import { normalizeAppRoles } from '../types/appRole';
import { roleHasPermission } from '../types/appPermissions';
import { loadRolePermissionsSettings } from '../services/rolePermissionsSettingsService';
import {
  anchorWatchTopicOnDate,
  clearWatchTopicRosterOrder,
  createWatchTopic,
  deleteWatchTopic,
  getWatchTopicForDate,
  getWatchTopicRosterSnapshot,
  getWatchTopicWeekAssignments,
  getWatchTopicsTodayYmd,
  listWatchTopics,
  saveWatchTopicRosterOrder,
  setWatchTopicCycleStartDate,
  setWatchTopicDayOverride,
  updateWatchTopic,
} from '../services/prayerWatchTopicsService';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function isValidOptionalString(value: unknown, maxLen = 5000): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  return value.length <= maxLen;
}

function isValidDateInput(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/** Админ, пастор или право `calendar.watch_topics_edit`. */
export async function assertCanEditWatchTopics(req: Request, res: Response): Promise<boolean> {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }

  const roles = normalizeAppRoles(
    Array.isArray(authReq.authUserRoles) && authReq.authUserRoles.length > 0
      ? authReq.authUserRoles
      : [authReq.authUserRole ?? 'member'],
    authReq.authUserRole,
  );

  if (roles.includes('admin') || roles.includes('pastor')) {
    return true;
  }

  try {
    const perms = await loadRolePermissionsSettings();
    if (roleHasPermission(perms, roles, 'calendar.watch_topics_edit')) {
      return true;
    }
  } catch (err) {
    console.error('watch-topics permission lookup failed:', err);
    res.status(500).json({ error: 'Не удалось проверить права доступа' });
    return false;
  }

  res.status(403).json({ error: 'Нет доступа к редактированию тем страж' });
  return false;
}

export async function getWatchTopicsList(req: Request, res: Response): Promise<void> {
  try {
    const includeInactive = req.query?.include_inactive !== '0' && req.query?.include_inactive !== 'false';
    const topics = await listWatchTopics(includeInactive);
    res.json(topics);
  } catch (err) {
    console.error('getWatchTopicsList error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postWatchTopic(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const title = req.body?.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Field "title" is required' });
    return;
  }
  if (
    !isValidOptionalString(req.body?.bible_verse) ||
    !isValidOptionalString(req.body?.prayer_points) ||
    !isValidOptionalString(req.body?.notes)
  ) {
    res.status(400).json({ error: 'Invalid field length' });
    return;
  }

  try {
    const topic = await createWatchTopic({
      title,
      bible_verse: req.body?.bible_verse ?? null,
      prayer_points: req.body?.prayer_points ?? null,
      notes: req.body?.notes ?? null,
      is_active: req.body?.is_active !== false,
    });
    res.status(201).json(topic);
  } catch (err) {
    console.error('postWatchTopic error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchWatchTopic(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid topic id' });
    return;
  }
  if (
    !isValidOptionalString(req.body?.bible_verse) ||
    !isValidOptionalString(req.body?.prayer_points) ||
    !isValidOptionalString(req.body?.notes) ||
    (req.body?.title !== undefined &&
      (typeof req.body.title !== 'string' || req.body.title.trim().length === 0))
  ) {
    res.status(400).json({ error: 'Invalid fields' });
    return;
  }

  try {
    const topic = await updateWatchTopic(id, {
      title: req.body?.title,
      bible_verse: req.body?.bible_verse,
      prayer_points: req.body?.prayer_points,
      notes: req.body?.notes,
      is_active: typeof req.body?.is_active === 'boolean' ? req.body.is_active : undefined,
      sort_order:
        typeof req.body?.sort_order === 'number' && Number.isInteger(req.body.sort_order)
          ? req.body.sort_order
          : undefined,
    });
    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    res.json(topic);
  } catch (err) {
    console.error('patchWatchTopic error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteWatchTopicHandler(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid topic id' });
    return;
  }

  try {
    const deleted = await deleteWatchTopic(id);
    if (!deleted) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('deleteWatchTopicHandler error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getWatchTopicByDate(req: Request, res: Response): Promise<void> {
  const dateParam = req.params.date;
  const date =
    dateParam === 'today' ? getWatchTopicsTodayYmd() : isValidDateInput(dateParam) ? dateParam : null;
  if (!date) {
    res.status(400).json({ error: 'Invalid date (YYYY-MM-DD or today)' });
    return;
  }

  try {
    const assignment = await getWatchTopicForDate(date);
    res.json(assignment);
  } catch (err) {
    console.error('getWatchTopicByDate error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getWatchTopicWeek(req: Request, res: Response): Promise<void> {
  try {
    const week = req.query?.week === 'next' ? 'next' : 'current';
    const days = await getWatchTopicWeekAssignments(week);
    res.json({ days, week });
  } catch (err) {
    console.error('getWatchTopicWeek error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getWatchTopicRoster(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const date =
    typeof req.query?.date === 'string' && isValidDateInput(req.query.date)
      ? req.query.date
      : getWatchTopicsTodayYmd();

  try {
    const snapshot = await getWatchTopicRosterSnapshot(date);
    res.json(snapshot);
  } catch (err) {
    console.error('getWatchTopicRoster error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function putWatchTopicRosterOrder(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const anchorDate = req.body?.anchor_date;
  const ordered = req.body?.ordered_topic_ids;
  if (!isValidDateInput(anchorDate) || !Array.isArray(ordered)) {
    res.status(400).json({ error: 'Ожидается anchor_date и ordered_topic_ids[]' });
    return;
  }
  const ids = ordered
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n) => Number.isInteger(n) && n > 0);

  try {
    const result = await saveWatchTopicRosterOrder({
      anchor_date: anchorDate,
      ordered_topic_ids: ids,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'empty_roster') {
      res.status(400).json({ error: 'Нет активных тем для очереди' });
      return;
    }
    console.error('putWatchTopicRosterOrder error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteWatchTopicRosterOrder(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const date =
    typeof req.query?.date === 'string' && isValidDateInput(req.query.date)
      ? req.query.date
      : typeof req.body?.anchor_date === 'string' && isValidDateInput(req.body.anchor_date)
        ? req.body.anchor_date
        : undefined;

  try {
    const result = await clearWatchTopicRosterOrder(date);
    res.json(result);
  } catch (err) {
    console.error('deleteWatchTopicRosterOrder error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postWatchTopicCycleStart(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const startDate = req.body?.start_date;
  if (!isValidDateInput(startDate)) {
    res.status(400).json({ error: 'Ожидается start_date (YYYY-MM-DD)' });
    return;
  }

  try {
    const saved = await setWatchTopicCycleStartDate(startDate);
    res.json({ start_date: saved });
  } catch (err) {
    console.error('postWatchTopicCycleStart error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postWatchTopicAnchor(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const topicId = parseId(String(req.body?.topic_id ?? ''));
  const anchorDate = req.body?.anchor_date;
  if (topicId == null || !isValidDateInput(anchorDate)) {
    res.status(400).json({ error: 'Ожидается topic_id и anchor_date' });
    return;
  }

  try {
    const result = await anchorWatchTopicOnDate({ topic_id: topicId, anchor_date: anchorDate });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'topic_not_found') {
      res.status(404).json({ error: 'Тема не найдена или неактивна' });
      return;
    }
    console.error('postWatchTopicAnchor error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function putWatchTopicDayOverride(req: Request, res: Response): Promise<void> {
  if (!(await assertCanEditWatchTopics(req, res))) return;

  const date = req.params.date;
  if (!isValidDateInput(date)) {
    res.status(400).json({ error: 'Invalid date' });
    return;
  }

  const rawTopicId = req.body?.topic_id;
  let topicId: number | null = null;
  if (rawTopicId !== null && rawTopicId !== undefined) {
    const parsed = typeof rawTopicId === 'number' ? rawTopicId : Number(rawTopicId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'Invalid topic_id (number or null)' });
      return;
    }
    topicId = parsed;
  }

  try {
    const assignment = await setWatchTopicDayOverride(date, topicId);
    res.json(assignment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'topic_not_found') {
      res.status(404).json({ error: 'Тема не найдена или неактивна' });
      return;
    }
    console.error('putWatchTopicDayOverride error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

/** Для проверки прав на клиенте (не раскрывает лишние данные). */
export async function getWatchTopicsCanEdit(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.json({ can_edit: false });
    return;
  }

  const roles = normalizeAppRoles(
    Array.isArray(authReq.authUserRoles) && authReq.authUserRoles.length > 0
      ? authReq.authUserRoles
      : [authReq.authUserRole ?? 'member'],
    authReq.authUserRole,
  );

  if (roles.includes('admin') || roles.includes('pastor')) {
    res.json({ can_edit: true });
    return;
  }

  try {
    const perms = await loadRolePermissionsSettings();
    res.json({ can_edit: roleHasPermission(perms, roles, 'calendar.watch_topics_edit') });
  } catch {
    res.json({ can_edit: false });
  }
}
