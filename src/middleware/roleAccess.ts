import { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';

/**
 * Роли доступа:
 * - Администратор (admin) — полный доступ
 * - Пользователь (member) — только просмотр
 */
export type UserRole = 'member' | 'admin';
type RoleRequest = Request & {
  userRole?: UserRole;
  authUserId?: number;
  authUserRole?: UserRole;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const ROLE_ALIASES: Record<string, UserRole> = {
  // Администратор
  admin: 'admin',
  administrator: 'admin',
  'администратор': 'admin',
  // Пользователь
  member: 'member',
  user: 'member',
  'пользователь': 'member',
  church_member: 'member',
  'church-member': 'member',
  'church member': 'member',
  'член_церкви': 'member',
  'член-церкви': 'member',
  'член церкви': 'member',
};

function normalizeRole(value: string | undefined): UserRole | null {
  if (!value) {
    return 'member';
  }

  const normalized = value.trim().toLowerCase();
  return ROLE_ALIASES[normalized] ?? null;
}

async function resolveRoleFromUserId(userIdHeader: string | undefined): Promise<UserRole | null> {
  if (!userIdHeader) {
    return null;
  }

  const userId = Number(userIdHeader);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  const result = await query(
    'SELECT app_role FROM members WHERE id = $1 AND is_active = TRUE LIMIT 1',
    [userId]
  );

  if (!result.rows[0]?.app_role || typeof result.rows[0].app_role !== 'string') {
    return null;
  }

  return normalizeRole(result.rows[0].app_role) ?? null;
}

export async function resolveUserRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const roleReq = req as RoleRequest;
  const roleHeader = req.header('x-role');
  const userIdHeader =
    req.header('x-user-id') ?? (roleReq.authUserId ? String(roleReq.authUserId) : undefined);
  let role: UserRole | null = null;

  if (roleReq.authUserRole) {
    role = roleReq.authUserRole;
  }

  if (!role && process.env.DATABASE_URL) {
    try {
      role = await resolveRoleFromUserId(userIdHeader);
    } catch (error) {
      console.error('Failed to resolve role from user id', error);
      res.status(500).json({ error: 'Failed to resolve user role' });
      return;
    }
  }

  if (!role) {
    role = normalizeRole(roleHeader);
  }

  if (!role) {
    res.status(400).json({
      error:
        'Unknown role. Provide valid "x-role" or active "x-user-id". Supported roles: "Пользователь", "Администратор".',
    });
    return;
  }

  roleReq.userRole = role;
  next();
}

/** Участники с ролью member могут PATCH только заявки на сбор нужд по текущему циклу. */
const MEMBER_ALLOWED_PATCH = /^\/api\/calendar\/cycle\/collection-claims\/?$/;

export function enforceRoleAccess(req: Request, res: Response, next: NextFunction): void {
  const roleReq = req as RoleRequest;
  const role = roleReq.userRole ?? 'member';

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.method === 'PATCH' && MEMBER_ALLOWED_PATCH.test(req.path)) {
    next();
    return;
  }

  if (role !== 'admin') {
    res.status(403).json({
      error: 'Access denied. Роль "Пользователь" может только просматривать данные.',
    });
    return;
  }

  next();
}
