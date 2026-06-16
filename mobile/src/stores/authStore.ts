import axios from 'axios';
import { create } from 'zustand';

import { AUTH_API_PREFIX, resolveApiOrigin } from '../lib/config';
import {
  clearAuthSession,
  getAuthToken,
  persistAuthProfile,
  readAuthProfile,
  setAuthToken,
} from '../lib/storage';

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
  roles: AuthRole[];
  registrationStatus: RegistrationStatus;
  username: string;
  memberId: number | null;
}

interface AuthState extends AuthProfile {
  token: string | null;
  hydrated: boolean;
  setSession: (session: { token: string } & AuthProfile) => void;
  applyServerProfile: (profile: AuthProfile) => void;
  clearSession: () => void;
  hydrate: () => void;
  login: (
    phoneNumber: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

function normalizeRole(raw: string | undefined): AuthRole {
  const r = (raw ?? 'member').trim().toLowerCase();
  if (!r) return 'member';
  return r as AuthRole;
}

export function normalizeRegistrationStatus(
  raw: string | undefined | null,
): RegistrationStatus {
  const s = (raw ?? 'active').trim().toLowerCase();
  if (s === 'pending_review' || s === 'rejected') return s;
  return 'active';
}

function displayName(state: Pick<AuthProfile, 'firstName' | 'lastName'>): string {
  return `${state.firstName} ${state.lastName}`.trim();
}

export function useAuthDisplayName(): string {
  const firstName = useAuthStore((s) => s.firstName);
  const lastName = useAuthStore((s) => s.lastName);
  return displayName({ firstName, lastName });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  firstName: '',
  lastName: '',
  role: 'member',
  roles: ['member'],
  registrationStatus: 'active',
  username: '',
  memberId: null,
  hydrated: false,

  hydrate: () => {
    const token = getAuthToken();
    const profile = readAuthProfile();
    set({
      token,
      ...profile,
      roles: [normalizeRole(profile.role)],
      registrationStatus: normalizeRegistrationStatus(profile.registrationStatus),
      hydrated: true,
    });
  },

  setSession: ({ token, firstName, lastName, role, roles, registrationStatus, username, memberId }) => {
    const normalizedRole = normalizeRole(role);
    const normalizedRoles =
      Array.isArray(roles) && roles.length > 0
        ? Array.from(new Set(roles.map((r) => normalizeRole(String(r)))))
        : [normalizedRole];
    setAuthToken(token);
    persistAuthProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: normalizedRole,
      registrationStatus: normalizeRegistrationStatus(registrationStatus),
      username: (username ?? '').trim(),
      memberId: memberId ?? null,
    });
    set({
      token,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: normalizedRole,
      roles: normalizedRoles,
      registrationStatus: normalizeRegistrationStatus(registrationStatus),
      username: (username ?? '').trim(),
      memberId: memberId ?? null,
    });
  },

  applyServerProfile: (profile) => {
    if (!get().token) return;
    persistAuthProfile({
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      registrationStatus: profile.registrationStatus,
      username: profile.username,
      memberId: profile.memberId,
    });
    set({
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
      role: normalizeRole(profile.role),
      roles: profile.roles,
      registrationStatus: normalizeRegistrationStatus(profile.registrationStatus),
      username: profile.username.trim(),
      memberId: profile.memberId,
    });
  },

  clearSession: () => {
    clearAuthSession();
    set({
      token: null,
      firstName: '',
      lastName: '',
      role: 'member',
      roles: ['member'],
      registrationStatus: 'active',
      username: '',
      memberId: null,
    });
  },

  login: async (phoneNumber, password) => {
    try {
      const response = await axios.post<{
        token?: string;
        user?: {
          id?: number;
          first_name?: string;
          last_name?: string;
          app_role?: string;
          app_roles?: string[];
          registration_status?: string;
          username?: string;
        };
        error?: string;
      }>(
        `${resolveApiOrigin()}${AUTH_API_PREFIX}/login`,
        { phone_number: phoneNumber.trim(), password },
        {
          timeout: 25_000,
          headers: { Accept: 'application/json' },
          validateStatus: (s) => s !== undefined && s < 600,
        },
      );

      if (response.status === 401 || response.status === 400) {
        return { ok: false, message: 'Неверный телефон или пароль.' };
      }

      if (response.status !== 200 || !response.data) {
        const err =
          typeof response.data?.error === 'string'
            ? response.data.error
            : 'Не удалось войти. Попробуйте позже.';
        return { ok: false, message: err };
      }

      const { token, user } = response.data;
      if (!token || !user) {
        return { ok: false, message: 'Неверный телефон или пароль.' };
      }

      get().setSession({
        token,
        firstName: (user.first_name ?? '').trim(),
        lastName: (user.last_name ?? '').trim(),
        role: normalizeRole(user.app_role),
        roles: Array.isArray(user.app_roles)
          ? user.app_roles.map((r) => normalizeRole(String(r)))
          : [normalizeRole(user.app_role)],
        registrationStatus: normalizeRegistrationStatus(user.registration_status),
        username: (user.username ?? '').trim(),
        memberId: typeof user.id === 'number' ? user.id : null,
      });

      return { ok: true };
    } catch {
      return { ok: false, message: 'Нет соединения с сервером. Проверьте API.' };
    }
  },

  logout: async () => {
    const token = get().token;
    try {
      if (token) {
        await axios.post(
          `${resolveApiOrigin()}${AUTH_API_PREFIX}/logout`,
          {},
          {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            timeout: 10_000,
          },
        );
      }
    } catch {
      /* ignore */
    }
    get().clearSession();
  },

  refreshProfile: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const { data } = await axios.get<{
        first_name?: string;
        last_name?: string;
        app_role?: string;
        app_roles?: string[];
        registration_status?: string;
        username?: string;
        id?: number;
      }>(`${resolveApiOrigin()}${AUTH_API_PREFIX}/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 15_000,
      });
      get().applyServerProfile({
        firstName: (data.first_name ?? '').trim(),
        lastName: (data.last_name ?? '').trim(),
        role: normalizeRole(data.app_role),
        roles: Array.isArray(data.app_roles)
          ? data.app_roles.map((r) => normalizeRole(String(r)))
          : [normalizeRole(data.app_role)],
        registrationStatus: normalizeRegistrationStatus(data.registration_status),
        username: (data.username ?? '').trim(),
        memberId: typeof data.id === 'number' ? data.id : null,
      });
    } catch {
      /* ignore */
    }
  },
}));

export function isAdminRole(role: AuthRole): boolean {
  return role === 'admin' || role === 'pastor';
}

export function isActiveMember(status: RegistrationStatus): boolean {
  return status === 'active';
}
