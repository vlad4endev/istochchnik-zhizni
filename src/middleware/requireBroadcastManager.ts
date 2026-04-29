import type { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

function hasPrivilegedRole(req: Request): boolean {
  const role = normalize(req.authUserRole);
  if (role === 'admin' || role === 'minister') return true;
  const roles = Array.isArray(req.authUserRoles) ? req.authUserRoles : [];
  return roles.map((r) => normalize(r)).some((r) => r === 'admin' || r === 'minister');
}

export async function requireBroadcastManager(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return;
  }
  if (hasPrivilegedRole(req)) {
    next();
    return;
  }
  try {
    const r = await query(`select ministry_direction from public.members where id = $1 limit 1`, [
      req.authUserId,
    ]);
    const direction = normalize((r.rows[0] as { ministry_direction?: string } | undefined)?.ministry_direction);
    if (direction.includes('медиа')) {
      next();
      return;
    }
  } catch (e) {
    console.error('[broadcast] requireBroadcastManager lookup failed:', e);
    res.status(500).json({ error: 'Не удалось проверить права доступа' });
    return;
  }
  res.status(403).json({ error: 'Недостаточно прав для управления трансляцией' });
}
