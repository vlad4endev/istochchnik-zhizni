import type { NextFunction, Request, Response } from 'express';

type AuthReq = Request & { isImpersonating?: boolean };

export function blockImpersonationForChats(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthReq;
  if (authReq.isImpersonating) {
    res.status(403).json({
      error: 'access_denied_during_impersonation',
      message: 'Раздел чатов недоступен в режиме просмотра аккаунта',
    });
    return;
  }
  next();
}
