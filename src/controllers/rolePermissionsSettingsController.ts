import type { Request, Response } from 'express';
import { notifyRealtime } from '../realtime/notify';
import {
  APP_PERMISSION_CATEGORIES,
  APP_PERMISSION_DEFS,
  APP_PERMISSION_IDS,
  type AppPermissionId,
} from '../types/appPermissions';
import { APP_ROLE_IDS, type AppRole } from '../types/sectionVisibilitySettings';
import {
  loadRolePermissionsSettings,
  patchRolePermissionsSettings,
  resetRolePermissionsSettings,
  type RolePermissionsPatch,
} from '../services/rolePermissionsSettingsService';

type AuthRequest = Request & { authUserRole?: string; authUserRoles?: AppRole[] };

function ensureAdmin(req: Request, res: Response): boolean {
  const r = req as AuthRequest;
  const primary = (r.authUserRole ?? '').trim().toLowerCase();
  const all = Array.isArray(r.authUserRoles) ? r.authUserRoles : [];
  if (primary === 'admin' || all.includes('admin')) {
    return true;
  }
  res.status(403).json({ error: 'Только администратор может менять права ролей.' });
  return false;
}

const ROLE_LABELS: Record<AppRole, string> = {
  parishioner: 'Прихожанин',
  member: 'Участник',
  minister: 'Служитель',
  pastor: 'Пастор',
  musician: 'Музыкант',
  editor: 'Редактор',
  admin: 'Администратор',
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  parishioner: 'Ограниченный гостевой доступ: чаты и базовый профиль.',
  member: 'Обычный участник церкви: молитва, песенник, лента.',
  minister: 'Служитель: планировщик служений и трансляции.',
  pastor: 'Пастор: расширенный участник без админ-функций.',
  musician: 'Музыкант: полный доступ к студии и каталогу песен.',
  editor: 'Редактор: модерация каталога песен.',
  admin: 'Полный доступ ко всем функциям и админ-панели.',
};

export async function getRolePermissionsSettingsPublic(_req: Request, res: Response): Promise<void> {
  try {
    const doc = await loadRolePermissionsSettings();
    res.json(doc);
  } catch (e) {
    console.error('[role-permissions] GET public error', e);
    res.status(500).json({ error: 'Не удалось загрузить права ролей' });
  }
}

export async function getRolePermissionsSettingsAdmin(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const doc = await loadRolePermissionsSettings();
    res.json({
      ...doc,
      categories: APP_PERMISSION_CATEGORIES,
      permission_defs: APP_PERMISSION_DEFS,
      role_options: APP_ROLE_IDS.map((id) => ({
        id,
        label: ROLE_LABELS[id],
        description: ROLE_DESCRIPTIONS[id],
      })),
    });
  } catch (e) {
    console.error('[role-permissions] GET admin error', e);
    res.status(500).json({ error: 'Не удалось загрузить права ролей' });
  }
}

function isAppRole(input: string): input is AppRole {
  return (APP_ROLE_IDS as readonly string[]).includes(input);
}

export async function patchRolePermissionsSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { roles?: unknown } | null;
  if (!body || typeof body !== 'object' || !body.roles || typeof body.roles !== 'object') {
    res.status(400).json({ error: 'Ожидался объект { roles: { roleId: { permissionId: boolean } } }' });
    return;
  }

  const rawRoles = body.roles as Record<string, unknown>;
  const patch: RolePermissionsPatch = {};

  for (const roleKey of Object.keys(rawRoles)) {
    if (!isAppRole(roleKey)) {
      res.status(400).json({ error: `Неизвестная роль: ${roleKey}` });
      return;
    }
    const rawPerms = rawRoles[roleKey];
    if (!rawPerms || typeof rawPerms !== 'object') {
      res.status(400).json({ error: `Некорректные права для роли: ${roleKey}` });
      return;
    }
    const permPatch: Partial<Record<AppPermissionId, boolean>> = {};
    for (const [permKey, value] of Object.entries(rawPerms as Record<string, unknown>)) {
      if (!(APP_PERMISSION_IDS as readonly string[]).includes(permKey)) {
        res.status(400).json({ error: `Неизвестное право: ${permKey}` });
        return;
      }
      if (typeof value !== 'boolean') {
        res.status(400).json({ error: `Право ${permKey} должно быть boolean` });
        return;
      }
      permPatch[permKey as AppPermissionId] = value;
    }
    patch[roleKey] = permPatch;
  }

  try {
    const doc = await patchRolePermissionsSettings(patch);
    notifyRealtime(['admin']);
    res.json(doc);
  } catch (e) {
    console.error('[role-permissions] PATCH error', e);
    res.status(500).json({ error: 'Не удалось сохранить права ролей' });
  }
}

export async function resetRolePermissionsSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const doc = await resetRolePermissionsSettings();
    notifyRealtime(['admin']);
    res.json(doc);
  } catch (e) {
    console.error('[role-permissions] RESET error', e);
    res.status(500).json({ error: 'Не удалось сбросить права ролей' });
  }
}
