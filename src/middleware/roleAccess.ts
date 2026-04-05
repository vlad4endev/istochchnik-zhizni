import { NextFunction, Request, Response } from 'express';

/**
 * Роли доступа (для coarse-grained middleware):
 * - admin — может менять данные через маршруты под enforceRoleAccess
 * - member — только безопасные чтения и явно разрешённые PATCH (см. MEMBER_ALLOWED_PATCH)
 *
 * Роль берётся только из сессии (Bearer), установленной в resolveAuthSession.
 * Заголовки x-role / x-user-id не используются — иначе любой клиент мог бы выдать себе права админа.
 */
export type UserRole = 'member' | 'admin';
type RoleRequest = Request & {
  userRole?: UserRole;
  authUserId?: number;
  authUserRole?: UserRole;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function resolveUserRole(req: Request, _res: Response, next: NextFunction): void {
  const roleReq = req as RoleRequest;
  const sessionRole = roleReq.authUserRole;

  if (sessionRole === 'admin' || sessionRole === 'member') {
    roleReq.userRole = sessionRole;
  } else {
    roleReq.userRole = 'member';
  }

  next();
}

/** Участники с ролью member могут PATCH только заявки на сбор нужд (новый и legacy URL). */
const MEMBER_ALLOWED_PATCH =
  /^\/api\/calendar\/(?:cycle\/collection-claims|next-week\/collection|member-cycle-prayer)\/?$/;

/** Web Push / FCM: мутации привязаны к member_id из сессии (requireAuthSession в роутере). */
const MEMBER_NOTIFICATIONS_POST =
  /^\/api\/notifications\/(?:subscribe|unsubscribe|save-token)\/?$/;

function fullUrlPath(req: Request): string {
  // IMPORTANT: app.use('/api/messenger', ...) меняет req.path (без префикса),
  // поэтому используем originalUrl для RBAC-исключений.
  return (req.originalUrl || req.url || req.path || '').split('?')[0] || '';
}

export function enforceRoleAccess(req: Request, res: Response, next: NextFunction): void {
  const roleReq = req as RoleRequest;
  const role = roleReq.userRole ?? 'member';
  const fullPath = fullUrlPath(req);

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.method === 'PATCH' && MEMBER_ALLOWED_PATCH.test(fullPath)) {
    next();
    return;
  }

  if (role === 'member') {
    // Messenger: отдельные права на уровне чата (checkChatPermission), поэтому разрешаем мутации.
    if (fullPath.startsWith('/api/messenger/')) {
      next();
      return;
    }
    // Profile: разрешаем PATCH/POST только для /auth/me (и /avatar).
    if ((req.method === 'PATCH' || req.method === 'POST') && (fullPath === '/api/auth/me' || fullPath === '/api/auth/me/avatar')) {
      next();
      return;
    }
    // Уведомления (PWA / натив): подписка и FCM-токен — только для текущего пользователя.
    if (req.method === 'POST' && MEMBER_NOTIFICATIONS_POST.test(fullPath)) {
      next();
      return;
    }
  }

  if (role !== 'admin') {
    res.status(403).json({
      error: 'Access denied. Роль "Пользователь" может только просматривать данные.',
    });
    return;
  }

  next();
}
