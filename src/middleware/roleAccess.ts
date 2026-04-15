import { NextFunction, Request, Response } from 'express';

import type { AppRole } from '../types/appRole';
import { canAccessStudio, canModerateCatalog, normalizeAppRole } from '../types/appRole';

/**
 * Грубая фильтрация по роли из сессии (Bearer).
 * Детальные проверки — в контроллерах (особенно /api/studio и модерация каталога).
 */
export type UserRole = AppRole;
type RoleRequest = Request & {
  userRole?: UserRole;
  authUserId?: number;
  authUserRole?: AppRole;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function resolveUserRole(req: Request, _res: Response, next: NextFunction): void {
  const roleReq = req as RoleRequest;
  roleReq.userRole = normalizeAppRole(roleReq.authUserRole);
  next();
}

/** Участники с ролью member могут PATCH только заявки на сбор нужд (новый и legacy URL). */
const MEMBER_ALLOWED_PATCH =
  /^\/api\/calendar\/(?:cycle\/collection-claims|next-week\/collection|member-cycle-prayer)\/?$/;

/** То же для координаторов: POST улучшения текста нужды — проверка роли в контроллере. */
const MEMBER_ALLOWED_CALENDAR_POST =
  /^\/api\/calendar\/prayer-need\/improve-text\/?$/;

/** Web Push / FCM: мутации привязаны к member_id из сессии (requireAuthSession в роутере). */
const MEMBER_NOTIFICATIONS_POST =
  /^\/api\/notifications\/(?:subscribe|unsubscribe|save-token)\/?$/;

/** Профиль / лента: мутации только своего контента (проверка в контроллере по сессии). */
function isMemberProfileMutation(method: string, path: string): boolean {
  if (method === 'PATCH' && /^\/api\/profile\/settings\/?$/.test(path)) return true;
  if (method === 'PATCH' && /^\/api\/posts\/\d+\/?$/.test(path)) return true;
  if (method === 'POST') {
    if (path === '/api/posts' || path === '/api/posts/') return true;
    if (/^\/api\/posts\/\d+\/(like|comment|repost)\/?$/.test(path)) return true;
  }
  if (method === 'DELETE' && /^\/api\/posts\/\d+\/like\/?$/.test(path)) return true;
  if (method === 'DELETE' && /^\/api\/posts\/\d+\/?$/.test(path)) return true;
  return false;
}

function isSongFavoriteMutation(method: string, path: string): boolean {
  return (
    (method === 'POST' || method === 'DELETE') && /^\/api\/songs\/\d+\/favorite\/?$/.test(path)
  );
}

/** Запись «песня открыта» для недавних в студии — любой авторизованный участник. */
function isSongOpenPost(method: string, path: string): boolean {
  return method === 'POST' && /^\/api\/songs\/\d+\/open\/?$/.test(path);
}

/** POST/PATCH/DELETE каталога (не избранное). */
function isSongCatalogMutation(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method)) return false;
  const p = path.split('?')[0];
  if (!p.startsWith('/api/songs')) return false;
  if (/^\/api\/songs\/\d+\/favorite\/?$/.test(p)) return false;
  if (p === '/api/songs' || p === '/api/songs/') return method === 'POST';
  return /^\/api\/songs\/\d+\/?$/.test(p) && (method === 'PATCH' || method === 'DELETE');
}

function isStudioApiPath(path: string): boolean {
  return path.startsWith('/api/studio/');
}

function fullUrlPath(req: Request): string {
  return (req.originalUrl || req.url || req.path || '').split('?')[0] || '';
}

/** Обычные пользовательские мутации (мессенджер, профиль и т.д.) — не только member. */
function isStandardParticipantMutation(
  role: AppRole,
  method: string,
  path: string,
  authUserId: number | undefined
): boolean {
  if (role !== 'member' && role !== 'musician' && role !== 'editor') {
    return false;
  }
  if (path.startsWith('/api/messenger/')) {
    return true;
  }
  if (
    (method === 'PATCH' || method === 'POST') &&
    (path === '/api/auth/me' || path === '/api/auth/me/')
  ) {
    return true;
  }
  if (method === 'POST' && path === '/api/auth/me/avatar') {
    return true;
  }
  if (method === 'POST' && MEMBER_NOTIFICATIONS_POST.test(path)) {
    return true;
  }
  if (isMemberProfileMutation(method, path)) {
    return true;
  }
  if (isSongFavoriteMutation(method, path) && authUserId) {
    return true;
  }
  return false;
}

export function enforceRoleAccess(req: Request, res: Response, next: NextFunction): void {
  const roleReq = req as RoleRequest;
  const role = roleReq.userRole ?? 'member';
  const fullPath = fullUrlPath(req);
  const authId = roleReq.authUserId;

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.method === 'PATCH' && MEMBER_ALLOWED_PATCH.test(fullPath)) {
    next();
    return;
  }

  if (req.method === 'POST' && MEMBER_ALLOWED_CALENDAR_POST.test(fullPath)) {
    next();
    return;
  }

  if (isSongFavoriteMutation(req.method, fullPath) && authId) {
    next();
    return;
  }

  if (isSongOpenPost(req.method, fullPath) && authId) {
    next();
    return;
  }

  if (isStudioApiPath(fullPath) && authId && canAccessStudio(role)) {
    next();
    return;
  }

  if (isSongCatalogMutation(req.method, fullPath) && authId && canModerateCatalog(role)) {
    next();
    return;
  }

  if (isStandardParticipantMutation(role, req.method, fullPath, authId)) {
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
