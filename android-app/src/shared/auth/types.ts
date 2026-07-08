export type AuthRole =
  | 'parishioner'
  | 'member'
  | 'minister'
  | 'pastor'
  | 'musician'
  | 'editor'
  | 'admin'
  | (string & {});

export type RegistrationStatus = 'active' | 'pending_review' | 'rejected';

export interface AuthProfile {
  firstName: string;
  lastName: string;
  role: AuthRole;
  roles?: AuthRole[];
  registrationStatus: RegistrationStatus;
  username: string;
  memberId: number | null;
}

export interface AuthMeResponse {
  id?: number;
  first_name?: string;
  last_name?: string;
  app_role?: string;
  app_roles?: string[];
  registration_status?: string;
  username?: string;
}

export function normalizeRole(raw: string | undefined): AuthRole {
  const r = (raw ?? 'member').trim().toLowerCase();
  if (!r) return 'member';
  if (r === 'admin') return 'admin';
  if (r === 'minister') return 'minister';
  if (r === 'pastor') return 'pastor';
  if (r === 'editor') return 'editor';
  if (r === 'musician') return 'musician';
  if (r === 'parishioner') return 'parishioner';
  return 'member';
}

export function normalizeRegistrationStatus(raw: string | undefined | null): RegistrationStatus {
  const s = (raw ?? 'active').trim().toLowerCase();
  if (s === 'pending_review' || s === 'rejected') return s;
  return 'active';
}

export function mapAuthMeToProfile(data: AuthMeResponse): AuthProfile {
  return {
    firstName: (data.first_name ?? '').trim(),
    lastName: (data.last_name ?? '').trim(),
    role: normalizeRole(data.app_role),
    roles: Array.isArray(data.app_roles) ? data.app_roles.map(normalizeRole) : undefined,
    registrationStatus: normalizeRegistrationStatus(data.registration_status),
    username: (data.username ?? '').trim(),
    memberId: typeof data.id === 'number' ? data.id : null,
  };
}
