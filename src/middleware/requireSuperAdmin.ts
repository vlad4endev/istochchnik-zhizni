import type { NextFunction, Request, Response } from 'express';
import type { AppRole } from '../types/appRole';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: AppRole;
  authUserRoles?: AppRole[];
  realAdminId?: number;
  isImpersonating?: boolean;
};

function hasAdminRole(role: AppRole | undefined, roles: AppRole[] | undefined): boolean {
  const allRoles = Array.isArray(roles) ? roles : [];
  return role === 'admin' || allRoles.includes('admin');
}

/** Высшая роль в системе — `admin` (отдельной superadmin нет). */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return;
  }
  if (authReq.isImpersonating) {
    res.status(403).json({ error: 'Недоступно в режиме просмотра аккаунта' });
    return;
  }
  if (!hasAdminRole(authReq.authUserRole, authReq.authUserRoles)) {
    res.status(403).json({ error: 'Только администратор имеет доступ' });
    return;
  }
  next();
}
