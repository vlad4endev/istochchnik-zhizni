import { apiClient } from '../../lib/apiClient';
import type { AppRole } from './sectionVisibilityApi';

export type AppPermissionId = string;

export interface PermissionDef {
  id: AppPermissionId;
  category: string;
  label: string;
  description: string;
}

export interface PermissionCategory {
  id: string;
  label: string;
  description: string;
}

export type RolePermissionMap = Record<AppPermissionId, boolean>;

export type RolePermissionsByRole = Record<AppRole, RolePermissionMap>;

export interface RolePermissionsSettingsPublic {
  roles: RolePermissionsByRole;
}

export interface RoleOption {
  id: AppRole;
  label: string;
  description: string;
}

export interface RolePermissionsSettingsAdmin extends RolePermissionsSettingsPublic {
  categories: PermissionCategory[];
  permission_defs: PermissionDef[];
  role_options: RoleOption[];
}

export async function fetchRolePermissionsPublic(): Promise<RolePermissionsSettingsPublic> {
  const { data } = await apiClient.get<RolePermissionsSettingsPublic>('/api/settings/role-permissions');
  return data;
}

export async function fetchRolePermissionsAdmin(): Promise<RolePermissionsSettingsAdmin> {
  const { data } = await apiClient.get<RolePermissionsSettingsAdmin>('/api/settings/role-permissions/admin');
  return data;
}

export async function patchRolePermissions(body: {
  roles: Partial<Record<AppRole, Partial<Record<AppPermissionId, boolean>>>>;
}): Promise<RolePermissionsSettingsPublic> {
  const { data } = await apiClient.patch<RolePermissionsSettingsPublic>('/api/settings/role-permissions', body);
  return data;
}

export async function resetRolePermissions(): Promise<RolePermissionsSettingsPublic> {
  const { data } = await apiClient.post<RolePermissionsSettingsPublic>('/api/settings/role-permissions/reset');
  return data;
}

export function roleHasPermission(
  settings: RolePermissionsSettingsPublic | undefined,
  roles: AppRole[],
  permissionId: AppPermissionId,
): boolean {
  if (!settings) return false;
  const unique = Array.from(new Set(roles));
  for (const role of unique) {
    if (settings.roles[role]?.[permissionId]) return true;
  }
  return false;
}

/** Заблокированные права администратора (нельзя отключить в UI). */
export const ADMIN_LOCKED_PERMISSIONS = ['admin.panel', 'admin.users_manage'] as const;

export function isPermissionLocked(role: AppRole, permissionId: AppPermissionId): boolean {
  return role === 'admin' && (ADMIN_LOCKED_PERMISSIONS as readonly string[]).includes(permissionId);
}
