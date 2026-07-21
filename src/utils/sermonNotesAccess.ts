import type { Request, Response } from 'express';

import { query } from '../config/db';
import { memberHasMinistryRole } from './ministryRoleMatch';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
};

function hasPastorOrAdminRole(req: AuthReq): boolean {
  const role = String(req.authUserRole ?? 'member').toLowerCase();
  if (role === 'pastor' || role === 'admin') return true;
  const roles = Array.isArray(req.authUserRoles) ? req.authUserRoles : [];
  return roles.some((r) => {
    const v = String(r ?? '').toLowerCase();
    return v === 'pastor' || v === 'admin';
  });
}

/** Доступ к «Мои проповеди»: проповедник (ministry_role) или pastor/admin. */
export async function canAccessMySermons(req: AuthReq): Promise<boolean> {
  if (!req.authUserId) return false;
  if (hasPastorOrAdminRole(req)) return true;
  const roleRes = await query(`SELECT ministry_role FROM public.members WHERE id = $1 LIMIT 1`, [
    req.authUserId,
  ]);
  const ministryRole = (roleRes.rows[0] as { ministry_role?: string | null } | undefined)?.ministry_role;
  return memberHasMinistryRole(ministryRole, 'Проповедник');
}

export async function ensureMySermonsAccess(req: AuthReq, res: Response): Promise<boolean> {
  if (!req.authUserId) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return false;
  }
  const allow = await canAccessMySermons(req);
  if (!allow) {
    res.status(403).json({ error: 'Раздел «Мои проповеди» доступен только проповеднику, пастору или администратору' });
    return false;
  }
  return true;
}
