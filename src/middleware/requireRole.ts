import type { NextFunction, Request, Response } from 'express';
import type { AppRole } from '../types/appRole';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: AppRole;
  authUserRoles?: AppRole[];
};

export function requireRole(...allowedRoles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthReq;
    if (!authReq.authUserId) {
      res.status(401).json({ error: 'Требуется вход в аккаунт' });
      return;
    }
    const role = String(authReq.authUserRole ?? '').toLowerCase() as AppRole;
    const roles = Array.isArray(authReq.authUserRoles) ? authReq.authUserRoles : [];
    const allowed = new Set(allowedRoles.map((item) => String(item).toLowerCase()));
    if (!allowed.has(role) && !roles.some((item) => allowed.has(String(item).toLowerCase()))) {
      res.status(403).json({ error: 'Недостаточно прав для выполнения действия' });
      return;
    }
    next();
  };
}
