import type { Request, Response } from 'express';
import { query } from '../config/db';
import { notifyRealtime } from '../realtime/notify';
import {
  listMySundaySchedulePlans,
  listSundayScheduleMembers,
  listSundaySchedulePlans,
  patchSundayScheduleAssignments,
} from '../services/sundayScheduleService';
import { rolesOfSession, type SessionRoleSource } from '../types/appRole';
import { sessionCanModerateCatalog } from '../types/appRole';
import {
  canManageSundaySchedule,
  canViewSundaySchedule,
} from '../utils/ministryScheduleAccess';

type AuthReq = Request & SessionRoleSource & { authUserId?: number };

function parseDateYmd(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function getMemberProfile(
  memberId: number,
): Promise<{ ministry_direction: string | null; ministry_role: string | null } | null> {
  const res = await query(
    `SELECT ministry_direction, ministry_role FROM members WHERE id = $1 LIMIT 1`,
    [memberId],
  );
  const row = res.rows[0] as { ministry_direction?: string | null; ministry_role?: string | null } | undefined;
  if (!row) return null;
  return {
    ministry_direction: row.ministry_direction == null ? null : String(row.ministry_direction),
    ministry_role: row.ministry_role == null ? null : String(row.ministry_role),
  };
}

async function ensureAuth(req: Request, res: Response): Promise<number | null> {
  const userId = (req as AuthReq).authUserId;
  if (!userId) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return null;
  }
  return userId;
}

async function ensureSundayScheduleView(req: Request, res: Response): Promise<number | null> {
  const userId = await ensureAuth(req, res);
  if (userId == null) return null;
  const r = req as AuthReq;
  if (sessionCanModerateCatalog(r)) return userId;
  const profile = await getMemberProfile(userId);
  if (
    !profile ||
    !canViewSundaySchedule({
      ministry_direction: profile.ministry_direction,
      ministry_role: profile.ministry_role,
    })
  ) {
    res.status(403).json({ error: 'Раздел доступен служителям с указанным направлением или ролью' });
    return null;
  }
  return userId;
}

async function ensureSundayScheduleManage(req: Request, res: Response): Promise<number | null> {
  const userId = await ensureAuth(req, res);
  if (userId == null) return null;
  const r = req as AuthReq;
  const sessionRoles = rolesOfSession(r);
  if (
    !canManageSundaySchedule({
      app_role: r.authUserRole,
      app_roles: sessionRoles,
    })
  ) {
    res.status(403).json({ error: 'Редактирование доступно только пастору' });
    return null;
  }
  return userId;
}

export async function getSundaySchedulePlans(req: Request, res: Response): Promise<void> {
  if (!(await ensureSundayScheduleView(req, res))) return;
  const from = parseDateYmd(req.query.from);
  const to = parseDateYmd(req.query.to);
  try {
    res.json(
      await listSundaySchedulePlans({
        from: from ?? undefined,
        to: to ?? undefined,
      }),
    );
  } catch (e) {
    console.error('[sunday-schedule] getSundaySchedulePlans:', e);
    res.status(500).json({ error: 'Не удалось загрузить расписание' });
  }
}

export async function getMySundaySchedule(req: Request, res: Response): Promise<void> {
  const userId = await ensureSundayScheduleView(req, res);
  if (userId == null) return;
  const from = parseDateYmd(req.query.from);
  const to = parseDateYmd(req.query.to);
  try {
    res.json(
      await listMySundaySchedulePlans(userId, {
        from: from ?? undefined,
        to: to ?? undefined,
      }),
    );
  } catch (e) {
    console.error('[sunday-schedule] getMySundaySchedule:', e);
    res.status(500).json({ error: 'Не удалось загрузить расписание' });
  }
}

export async function getSundayScheduleMembers(req: Request, res: Response): Promise<void> {
  if (!(await ensureSundayScheduleView(req, res))) return;
  try {
    res.json(await listSundayScheduleMembers());
  } catch (e) {
    console.error('[sunday-schedule] getSundayScheduleMembers:', e);
    res.status(500).json({ error: 'Не удалось загрузить участников' });
  }
}

export async function patchSundaySchedulePlan(req: Request, res: Response): Promise<void> {
  if (!(await ensureSundayScheduleManage(req, res))) return;
  const planId = parseId(req.params.id);
  if (!planId) {
    res.status(400).json({ error: 'Некорректный id плана' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const patch: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  } = {};
  if ('leader_member_id' in body) {
    patch.leader_member_id = body.leader_member_id == null ? null : parseId(body.leader_member_id);
  }
  if ('preacher_member_id' in body) {
    patch.preacher_member_id = body.preacher_member_id == null ? null : parseId(body.preacher_member_id);
  }
  if (!('leader_member_id' in body) && !('preacher_member_id' in body)) {
    res.status(400).json({ error: 'Укажите leader_member_id и/или preacher_member_id' });
    return;
  }
  try {
    const ok = await patchSundayScheduleAssignments(planId, patch);
    if (!ok) {
      res.status(404).json({ error: 'План не найден' });
      return;
    }
    notifyRealtime(['service-planner']);
    res.status(204).send();
  } catch (e) {
    console.error('[sunday-schedule] patchSundaySchedulePlan:', e);
    res.status(500).json({ error: 'Не удалось обновить назначения' });
  }
}
