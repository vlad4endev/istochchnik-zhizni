import type { Request, Response } from 'express';
import { query } from '../config/db';
import { requireAuthSession } from '../middleware/authSession';
import { hasMusicMinistryDirection } from '../utils/ministryRoleMatch';
import {
  assignMember,
  createRole,
  deleteRole,
  getAssignmentById,
  getAssignmentsForPlan,
  getEventByPlanId,
  getEventsWithAssignments,
  getMusicMembers,
  getMemberSchedule,
  getRoles,
  parseDateYmd,
  parsePositiveInt,
  removeAssignment,
  reorderRoles,
  resolvePlanIdForChurchEvent,
  sendMusicScheduleReminders,
  updateAssignmentStatus,
  updateRole,
  type AssignmentStatus,
} from '../services/musicScheduleService';
import type { SessionRoleSource } from '../types/appRole';
import { canManageMusicSchedule as canManageMusicScheduleByProfile } from '../utils/ministryScheduleAccess';

type AuthReq = Request & SessionRoleSource & { authUserId?: number };

async function canManageMusicSchedule(req: Request): Promise<boolean> {
  const r = req as AuthReq;
  if (!r.authUserId) return false;
  const result = await query(`SELECT ministry_role FROM members WHERE id = $1 LIMIT 1`, [r.authUserId]);
  const row = result.rows[0] as { ministry_role?: string | null } | undefined;
  return canManageMusicScheduleByProfile({
    ministry_role: row?.ministry_role,
  });
}

async function canViewMusicSchedule(req: Request): Promise<boolean> {
  const r = req as AuthReq;
  if (!r.authUserId) return false;
  const result = await query(`SELECT ministry_direction FROM members WHERE id = $1 LIMIT 1`, [r.authUserId]);
  const row = result.rows[0] as { ministry_direction?: string | null } | undefined;
  return hasMusicMinistryDirection(row?.ministry_direction);
}

async function ensureAuth(req: Request, res: Response): Promise<number | null> {
  const userId = (req as AuthReq).authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }
  return userId;
}

async function ensureMusicScheduleView(req: Request, res: Response): Promise<number | null> {
  const userId = await ensureAuth(req, res);
  if (userId == null) return null;
  if (!(await canViewMusicSchedule(req))) {
    res.status(403).json({ error: 'Раздел доступен только служителям музыкального направления' });
    return null;
  }
  return userId;
}

async function ensureManager(req: Request, res: Response): Promise<number | null> {
  const userId = await ensureAuth(req, res);
  if (userId == null) return null;
  if (!(await canManageMusicSchedule(req))) {
    res.status(403).json({ error: 'Редактирование доступно только музыкальному лидеру' });
    return null;
  }
  return userId;
}

function parseRangeQuery(req: Request): { from: Date; to: Date } | null {
  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const fromStr = typeof fromRaw === 'string' ? fromRaw : Array.isArray(fromRaw) ? fromRaw[0] : '';
  const toStr = typeof toRaw === 'string' ? toRaw : Array.isArray(toRaw) ? toRaw[0] : '';
  const fromYmd = parseDateYmd(fromStr);
  const toYmd = parseDateYmd(toStr);
  if (!fromYmd || !toYmd) return null;
  return {
    from: new Date(`${fromYmd}T00:00:00`),
    to: new Date(`${toYmd}T23:59:59`),
  };
}

function defaultMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
}

function handleServiceError(res: Response, err: unknown, context: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'not_found' || msg === 'event_not_found') {
    res.status(404).json({ error: 'Не найдено' });
    return;
  }
  if (msg === 'invalid_input' || msg === 'invalid_status') {
    res.status(400).json({ error: 'Некорректные данные' });
    return;
  }
  if (msg === 'role_taken') {
    res.status(409).json({ error: 'На эту роль уже есть назначение в событии' });
    return;
  }
  if (msg === 'duplicate_assignment') {
    res.status(409).json({ error: 'Такое назначение уже существует' });
    return;
  }
  if (msg === 'member_not_found') {
    res.status(400).json({ error: 'Участник не найден' });
    return;
  }
  if (msg === 'role_not_found') {
    res.status(400).json({ error: 'Роль не найдена' });
    return;
  }
  if (msg === 'role_in_use') {
    res.status(409).json({ error: 'Роль используется в назначениях' });
    return;
  }
  console.error(`[music-schedule] ${context}:`, err);
  res.status(500).json({ error: 'Ошибка сервера' });
}

export async function getEvents(req: Request, res: Response): Promise<void> {
  if (!(await ensureMusicScheduleView(req, res))) return;
  try {
    const range = parseRangeQuery(req) ?? defaultMonthRange();
    const events = await getEventsWithAssignments(range.from, range.to);
    void sendMusicScheduleReminders().catch((e) =>
      console.warn('[music-schedule] reminders tick failed', e),
    );
    res.json({ events });
  } catch (err) {
    handleServiceError(res, err, 'getEvents');
  }
}

export async function getEventByPlanHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureMusicScheduleView(req, res))) return;
  const planId = parsePositiveInt(req.params.id);
  if (planId == null) {
    res.status(400).json({ error: 'Некорректный id плана' });
    return;
  }
  try {
    const event = await getEventByPlanId(planId);
    if (!event) {
      res.status(404).json({ error: 'План служения не найден' });
      return;
    }
    res.json({ event });
  } catch (err) {
    handleServiceError(res, err, 'getEventByPlan');
  }
}

export async function getAssignmentsForPlanHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureMusicScheduleView(req, res))) return;
  const planId = parsePositiveInt(req.params.id);
  if (planId == null) {
    res.status(400).json({ error: 'Некорректный id плана' });
    return;
  }
  try {
    const assignments = await getAssignmentsForPlan(planId);
    res.json({ assignments });
  } catch (err) {
    handleServiceError(res, err, 'getAssignmentsForPlan');
  }
}

export async function resolvePlanForChurchEventHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureAuth(req, res))) return;
  const churchEventId = parsePositiveInt(req.query.church_event_id);
  const date = parseDateYmd(
    typeof req.query.date === 'string' ? req.query.date : String(req.query.date ?? ''),
  );
  if (churchEventId == null || !date) {
    res.status(400).json({ error: 'Ожидается church_event_id и date' });
    return;
  }
  try {
    const planId = await resolvePlanIdForChurchEvent(churchEventId, date);
    res.json({ plan_id: planId });
  } catch (err) {
    handleServiceError(res, err, 'resolvePlanForChurchEvent');
  }
}

export async function assignMemberHandler(req: Request, res: Response): Promise<void> {
  const userId = await ensureManager(req, res);
  if (userId == null) return;
  const eventRefId = parsePositiveInt(req.params.id);
  const memberId = parsePositiveInt(req.body?.member_id);
  const roleId = parsePositiveInt(req.body?.role_id);
  if (eventRefId == null || memberId == null || roleId == null) {
    res.status(400).json({ error: 'Ожидается id плана, member_id и role_id' });
    return;
  }
  try {
    const assignment = await assignMember(eventRefId, memberId, roleId, userId);
    res.status(201).json({ assignment });
  } catch (err) {
    handleServiceError(res, err, 'assignMember');
  }
}

export async function removeAssignmentHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureManager(req, res))) return;
  const id = parsePositiveInt(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Некорректный id назначения' });
    return;
  }
  try {
    await removeAssignment(id);
    res.json({ ok: true });
  } catch (err) {
    handleServiceError(res, err, 'removeAssignment');
  }
}

export async function updateAssignmentStatusHandler(req: Request, res: Response): Promise<void> {
  const userId = await ensureAuth(req, res);
  if (userId == null) return;

  const id = parsePositiveInt(req.params.id);
  const status = String(req.body?.status ?? '').trim() as AssignmentStatus;
  if (id == null || !status) {
    res.status(400).json({ error: 'Ожидается id и status' });
    return;
  }
  if (status !== 'confirmed' && status !== 'declined') {
    res.status(400).json({ error: 'Можно установить только confirmed или declined' });
    return;
  }

  try {
    const assignment = await getAssignmentById(id);
    if (!assignment) {
      res.status(404).json({ error: 'Назначение не найдено' });
      return;
    }
    if (assignment.member_id !== userId && !(await canManageMusicSchedule(req))) {
      res.status(403).json({ error: 'Можно менять статус только своего назначения' });
      return;
    }
    await updateAssignmentStatus(id, status);
    res.json({ ok: true });
  } catch (err) {
    handleServiceError(res, err, 'updateAssignmentStatus');
  }
}

export async function getMySchedule(req: Request, res: Response): Promise<void> {
  if (!(await ensureMusicScheduleView(req, res))) return;
  const userId = (req as AuthReq).authUserId;
  if (userId == null) return;
  try {
    const range = parseRangeQuery(req) ?? (() => {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + 28);
      return { from, to };
    })();
    const events = await getMemberSchedule(userId, range.from, range.to);
    res.json({ events });
  } catch (err) {
    handleServiceError(res, err, 'getMySchedule');
  }
}

export async function getRolesHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureMusicScheduleView(req, res))) return;
  try {
    const roles = await getRoles();
    res.json({ roles });
  } catch (err) {
    handleServiceError(res, err, 'getRoles');
  }
}

export async function createRoleHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureManager(req, res))) return;
  try {
    const role = await createRole({
      name: String(req.body?.name ?? ''),
      color: req.body?.color,
      icon: req.body?.icon ?? null,
      sort_order: req.body?.sort_order,
      is_active: req.body?.is_active,
      ministry_direction_filter: req.body?.ministry_direction_filter ?? null,
      ministry_role_filter: req.body?.ministry_role_filter ?? null,
    });
    res.status(201).json({ role });
  } catch (err) {
    handleServiceError(res, err, 'createRole');
  }
}

export async function updateRoleHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureManager(req, res))) return;
  const id = parsePositiveInt(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Некорректный id роли' });
    return;
  }
  try {
    const role = await updateRole(id, {
      name: req.body?.name,
      color: req.body?.color,
      icon: req.body?.icon,
      sort_order: req.body?.sort_order,
      is_active: req.body?.is_active,
      ministry_direction_filter: req.body?.ministry_direction_filter,
      ministry_role_filter: req.body?.ministry_role_filter,
    });
    res.json({ role });
  } catch (err) {
    handleServiceError(res, err, 'updateRole');
  }
}

export async function deleteRoleHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureManager(req, res))) return;
  const id = parsePositiveInt(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Некорректный id роли' });
    return;
  }
  try {
    await deleteRole(id);
    res.json({ ok: true });
  } catch (err) {
    handleServiceError(res, err, 'deleteRole');
  }
}

export async function reorderRolesHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureManager(req, res))) return;
  const idsRaw = req.body?.ids;
  if (!Array.isArray(idsRaw)) {
    res.status(400).json({ error: 'Ожидается массив ids' });
    return;
  }
  const ids = idsRaw
    .map((v) => parsePositiveInt(v))
    .filter((v): v is number => v != null);
  try {
    await reorderRoles(ids);
    const roles = await getRoles();
    res.json({ roles });
  } catch (err) {
    handleServiceError(res, err, 'reorderRoles');
  }
}

export async function getMusicMembersHandler(req: Request, res: Response): Promise<void> {
  if (!(await ensureMusicScheduleView(req, res))) return;
  const roleIdRaw = req.query.role_id;
  const roleIdStr =
    typeof roleIdRaw === 'string' ? roleIdRaw : Array.isArray(roleIdRaw) ? roleIdRaw[0] : '';
  const roleId = parsePositiveInt(roleIdStr);
  try {
    const members = await getMusicMembers(roleId ?? undefined);
    res.json({ members });
  } catch (err) {
    handleServiceError(res, err, 'getMusicMembers');
  }
}

export { requireAuthSession };
