import type { NextFunction, Request, Response } from 'express';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
};

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return;
  }
  const allRoles = Array.isArray(authReq.authUserRoles) ? authReq.authUserRoles : [];
  if (authReq.authUserRole !== 'admin' && !allRoles.includes('admin')) {
    res.status(403).json({ error: 'Только администратор имеет доступ' });
    return;
  }
  next();
}
