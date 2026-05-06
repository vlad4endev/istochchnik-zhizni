import { NextFunction, Request, Response } from 'express';

import type { AppRole } from '../types/appRole';
import {
  canAccessStudio,
  canDeleteCatalogSong,
  canModerateCatalog,
  normalizeAppRole,
} from '../types/appRole';
import { query } from '../config/db';

/**
 * Грубая фильтрация по роли из сессии (Bearer).
 * Детальные проверки — в контроллерах (особенно /api/studio и модерация каталога).
 */
export type UserRole = AppRole;
type RoleRequest = Request & {
  userRole?: UserRole;
  authUserId?: number;
  authUserRole?: AppRole;
  authUserRoles?: AppRole[];
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeMinistryDirection(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

async function hasMusicMinistryDirection(memberId: number): Promise<boolean> {
  const r = await query(`select ministry_direction from public.members where id = $1 limit 1`, [memberId]);
  const raw = (r.rows[0] as { ministry_direction?: string } | undefined)?.ministry_direction;
  const v = normalizeMinistryDirection(raw);
  if (!v) return false;
  const target = normalizeMinistryDirection('Музыкальное служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryDirection(s))
    .some((s) => s === target || s.includes(target));
}

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
  /^\/api\/calendar\/(?:prayer-need\/improve-text|prayer-section\/visit)\/?$/;

/** Срочная нужда / объявление на дашборде — только координаторы и админ (проверка в контроллере). */
const COORDINATOR_DASHBOARD_NOTES_POST = /^\/api\/calendar\/dashboard-coordinator-notes\/?$/;

const COORDINATOR_DASHBOARD_NOTES_DELETE =
  /^\/api\/calendar\/dashboard-coordinator-notes\/(urgent_prayer|announcement)\/?$/;

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

/**
 * Сбор аналитики (page-view/event) должен работать для всех пользователей и гостей.
 * Read-only ограничения по роли не должны блокировать эти технические POST-запросы.
 */
function isAnalyticsTrackingPost(method: string, path: string): boolean {
  return method === 'POST' && /^\/api\/analytics\/track\/(?:page-view|event)\/?$/.test(path);
}

/** POST/PATCH каталога (создание и правка — музыканты студии, редакторы и админ). */
function isSongCatalogModerateMutation(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method)) return false;
  const p = path.split('?')[0];
  if (!p.startsWith('/api/songs')) return false;
  if (/^\/api\/songs\/\d+\/favorite\/?$/.test(p)) return false;
  if (p === '/api/songs' || p === '/api/songs/') return method === 'POST';
  return /^\/api\/songs\/\d+\/?$/.test(p) && method === 'PATCH';
}

/** DELETE песни из каталога (музыкант / редактор / админ — проверка роли ниже). */
function isSongCatalogDeleteMutation(method: string, path: string): boolean {
  if (method !== 'DELETE') return false;
  const p = path.split('?')[0];
  if (!p.startsWith('/api/songs')) return false;
  if (/^\/api\/songs\/\d+\/favorite\/?$/.test(p)) return false;
  return /^\/api\/songs\/\d+\/?$/.test(p);
}

function isStudioApiPath(path: string): boolean {
  return path.startsWith('/api/studio/');
}

function isServicePlannerMutation(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method)) return false;
  const p = path.split('?')[0];
  return (
    p.startsWith('/api/service-plans') ||
    p.startsWith('/api/service-templates') ||
    p.startsWith('/api/service-blocks') ||
    p.startsWith('/api/service-block-types')
  );
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
  if (role !== 'member' && role !== 'pastor' && role !== 'musician' && role !== 'editor') {
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
  const allRoles = Array.isArray(roleReq.authUserRoles) ? roleReq.authUserRoles : [];
  const hasRole = (target: AppRole): boolean => role === target || allRoles.includes(target);
  const isPlannerManager = hasRole('admin') || hasRole('minister');
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

  if (req.method === 'POST' && COORDINATOR_DASHBOARD_NOTES_POST.test(fullPath) && authId) {
    next();
    return;
  }

  if (req.method === 'DELETE' && COORDINATOR_DASHBOARD_NOTES_DELETE.test(fullPath) && authId) {
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

  if (isAnalyticsTrackingPost(req.method, fullPath)) {
    next();
    return;
  }

  if (isStudioApiPath(fullPath) && authId) {
    if (canAccessStudio(role)) {
      next();
      return;
    }
    void hasMusicMinistryDirection(authId)
      .then((ok) => {
        if (ok) next();
        else {
          res.status(403).json({
            error: 'Access denied. Роль "Пользователь" может только просматривать данные.',
          });
        }
      })
      .catch((e) => {
        console.error('[roleAccess] studio ministry_direction lookup failed:', e);
        res.status(500).json({ error: 'Не удалось проверить права доступа' });
      });
    return;
  }

  if (isSongCatalogModerateMutation(req.method, fullPath) && authId && canModerateCatalog(role)) {
    next();
    return;
  }

  if (isSongCatalogDeleteMutation(req.method, fullPath) && authId && canDeleteCatalogSong(role)) {
    next();
    return;
  }

  if (isServicePlannerMutation(req.method, fullPath) && authId && isPlannerManager) {
    next();
    return;
  }

  if (isStandardParticipantMutation(role, req.method, fullPath, authId)) {
    next();
    return;
  }

  if (!isPlannerManager) {
    res.status(403).json({
      error: 'Access denied. Роль "Пользователь" может только просматривать данные.',
    });
    return;
  }

  next();
}
