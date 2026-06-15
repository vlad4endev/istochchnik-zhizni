import { createHash } from 'crypto';
import { query } from '../config/db';
import type { AppRole } from '../types/appRole';
import { normalizeAppRole, normalizeAppRoles } from '../types/appRole';

const IMPERSONATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_STARTS_PER_HOUR = 10;

export type ImpersonationTargetMember = {
  id: number;
  name: string;
  email: string | null;
  role: AppRole;
};

export type ActiveImpersonationRow = {
  access_token_hash: string;
  admin_id: number;
  target_id: number;
  audit_id: number | null;
  expires_at: string;
};

export type ImpersonationStatus = {
  isImpersonating: boolean;
  realAdminId?: number;
  targetMember?: { id: number; name: string };
  expiresAt?: string;
};

function hashAccessToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

function isAdminRole(role: AppRole, roles: AppRole[]): boolean {
  return role === 'admin' || roles.includes('admin');
}

async function loadMemberBrief(memberId: number): Promise<ImpersonationTargetMember | null> {
  const result = await query(
    `SELECT id, name, first_name, last_name, email, app_role, app_roles
     FROM members
     WHERE id = $1
     LIMIT 1`,
    [memberId],
  );
  const row = result.rows[0] as
    | {
        id: number;
        name: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        app_role: string;
        app_roles: unknown;
      }
    | undefined;
  if (!row) return null;
  const role = normalizeAppRole(row.app_role);
  const fullName =
    `${String(row.first_name ?? '').trim()} ${String(row.last_name ?? '').trim()}`.trim() ||
    String(row.name ?? '').trim() ||
    `Участник #${row.id}`;
  return {
    id: row.id,
    name: fullName,
    email: row.email ?? null,
    role,
  };
}

export async function memberHasAdminPrivileges(memberId: number): Promise<boolean> {
  const result = await query(
    `SELECT app_role, app_roles FROM members WHERE id = $1 LIMIT 1`,
    [memberId],
  );
  const row = result.rows[0] as { app_role: string; app_roles: unknown } | undefined;
  if (!row) return false;
  const roles = normalizeAppRoles(row.app_roles, row.app_role);
  return isAdminRole(normalizeAppRole(row.app_role), roles);
}

export async function countImpersonationStartsInLastHour(adminId: number): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM audit_impersonation
     WHERE admin_id = $1
       AND started_at > NOW() - INTERVAL '1 hour'`,
    [adminId],
  );
  return Number((result.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0);
}

export async function getActiveImpersonationByToken(
  accessToken: string,
): Promise<ActiveImpersonationRow | null> {
  const tokenHash = hashAccessToken(accessToken);
  const result = await query(
    `SELECT access_token_hash, admin_id, target_id, audit_id, expires_at
     FROM auth_impersonation_active
     WHERE access_token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0] as ActiveImpersonationRow | undefined;
  return row ?? null;
}

export async function getImpersonationStatus(accessToken: string): Promise<ImpersonationStatus> {
  const active = await getActiveImpersonationByToken(accessToken);
  if (!active) {
    return { isImpersonating: false };
  }
  if (new Date(active.expires_at).getTime() <= Date.now()) {
    await exitImpersonationByToken(accessToken);
    return { isImpersonating: false };
  }
  const target = await loadMemberBrief(active.target_id);
  return {
    isImpersonating: true,
    realAdminId: active.admin_id,
    targetMember: target ? { id: target.id, name: target.name } : { id: active.target_id, name: `#${active.target_id}` },
    expiresAt: active.expires_at,
  };
}

export async function exitImpersonationByToken(accessToken: string): Promise<boolean> {
  const tokenHash = hashAccessToken(accessToken);
  const active = await getActiveImpersonationByToken(accessToken);
  if (!active) {
    return false;
  }
  await query(`DELETE FROM auth_impersonation_active WHERE access_token_hash = $1`, [tokenHash]);
  if (active.audit_id != null) {
    await query(
      `UPDATE audit_impersonation
       SET ended_at = COALESCE(ended_at, NOW())
       WHERE id = $1`,
      [active.audit_id],
    );
  }
  return true;
}

export async function startImpersonation(input: {
  adminId: number;
  targetMemberId: number;
  accessToken: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ targetMember: ImpersonationTargetMember; expiresAt: string }> {
  const starts = await countImpersonationStartsInLastHour(input.adminId);
  if (starts >= MAX_STARTS_PER_HOUR) {
    throw new Error('impersonation_rate_limited');
  }

  const existing = await getActiveImpersonationByToken(input.accessToken);
  if (existing) {
    throw new Error('impersonation_already_active');
  }

  const target = await loadMemberBrief(input.targetMemberId);
  if (!target) {
    throw new Error('target_not_found');
  }

  if (await memberHasAdminPrivileges(input.targetMemberId)) {
    throw new Error('target_is_admin');
  }

  if (input.targetMemberId === input.adminId) {
    throw new Error('cannot_impersonate_self');
  }

  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS).toISOString();
  const tokenHash = hashAccessToken(input.accessToken);

  const auditInsert = await query(
    `INSERT INTO audit_impersonation (admin_id, target_id, ip_address, user_agent)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.adminId, input.targetMemberId, input.ipAddress, input.userAgent],
  );
  const auditId = Number((auditInsert.rows[0] as { id: number }).id);

  await query(
    `INSERT INTO auth_impersonation_active (access_token_hash, admin_id, target_id, audit_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, input.adminId, input.targetMemberId, auditId, expiresAt],
  );

  return { targetMember: target, expiresAt };
}

export async function resolveImpersonationPrincipal(
  accessToken: string,
  sessionMemberId: number,
  sessionRole: AppRole,
  sessionRoles: AppRole[],
): Promise<{
  userId: number;
  role: AppRole;
  roles: AppRole[];
  realAdminId?: number;
  isImpersonating: boolean;
} | null> {
  const active = await getActiveImpersonationByToken(accessToken);
  if (!active) {
    return null;
  }

  if (new Date(active.expires_at).getTime() <= Date.now()) {
    await exitImpersonationByToken(accessToken);
    return null;
  }

  if (active.admin_id !== sessionMemberId) {
    await exitImpersonationByToken(accessToken);
    return null;
  }

  const targetResult = await query(
    `SELECT app_role, app_roles
     FROM members
     WHERE id = $1
       AND (is_active = TRUE OR registration_status = 'rejected')
     LIMIT 1`,
    [active.target_id],
  );
  const targetRow = targetResult.rows[0] as { app_role: string; app_roles: unknown } | undefined;
  if (!targetRow) {
    await exitImpersonationByToken(accessToken);
    return null;
  }

  const roles = normalizeAppRoles(targetRow.app_roles, targetRow.app_role);
  const role = normalizeAppRole(targetRow.app_role);

  return {
    userId: active.target_id,
    role,
    roles,
    realAdminId: active.admin_id,
    isImpersonating: true,
  };
}

export { hashAccessToken, IMPERSONATION_TTL_MS, MAX_STARTS_PER_HOUR };
