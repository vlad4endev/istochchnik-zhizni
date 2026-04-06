import axios from 'axios';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { AUTH_API_PREFIX, resolveAxiosBaseURL } from '../../lib/config';

/** Те же ключи, что в Flutter AuthTokenStore — можно читать сессию с того же origin. */
const LS_TOKEN = 'auth_access_token';
const LS_FIRST = 'auth_first_name';
const LS_LAST = 'auth_last_name';
const LS_ROLE = 'auth_role';
const LS_REG = 'auth_registration_status';

export type AuthRole = 'member' | 'admin' | (string & {});

export type RegistrationStatus = 'active' | 'pending_review' | 'rejected';

export interface AuthProfile {
  firstName: string;
  lastName: string;
  role: AuthRole;
  registrationStatus: RegistrationStatus;
}

interface AuthState extends AuthProfile {
  token: string | null;
  /** Установить сессию после login/register и записать в localStorage (через persist). */
  setSession: (session: { token: string } & AuthProfile) => void;
  /**
   * Обновить имя и роль из GET /api/auth/me (токен не меняется).
   */
  applyServerProfile: (profile: AuthProfile) => void;
  clearSession: () => void;
  /**
   * POST /api/auth/login — без использования общего apiClient (избегаем циклического импорта).
   */
  login: (phoneNumber: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /**
   * POST /api/auth/logout с Bearer, затем очистка локальной сессии.
   */
  logout: () => Promise<void>;
}

function normalizeRole(raw: string | undefined): AuthRole {
  const r = (raw ?? 'member').trim();
  if (!r) return 'member';
  return r.toLowerCase() === 'admin' ? 'admin' : r;
}

export function normalizeRegistrationStatus(raw: string | undefined | null): RegistrationStatus {
  const s = (raw ?? 'active').trim().toLowerCase();
  if (s === 'pending_review' || s === 'rejected') return s;
  return 'active';
}

function readLegacyFlutterKeys(): Partial<
  Pick<AuthState, 'token' | 'firstName' | 'lastName' | 'role' | 'registrationStatus'>
> | null {
  if (typeof localStorage === 'undefined') return null;
  const token = localStorage.getItem(LS_TOKEN);
  if (!token) return null;
  return {
    token,
    firstName: localStorage.getItem(LS_FIRST) ?? '',
    lastName: localStorage.getItem(LS_LAST) ?? '',
    role: normalizeRole(localStorage.getItem(LS_ROLE) ?? undefined),
    registrationStatus: normalizeRegistrationStatus(localStorage.getItem(LS_REG)),
  };
}

/**
 * Хранилище Zustand persist, пишущее те же ключи, что Flutter SharedPreferences на web.
 */
const flutterCompatibleStorage: StateStorage = {
  getItem: () => {
    if (typeof localStorage === 'undefined') return null;
    const legacy = readLegacyFlutterKeys();
    const token = legacy?.token ?? localStorage.getItem(LS_TOKEN);
    if (!token) return null;
    return JSON.stringify({
      state: {
        token,
        firstName: legacy?.firstName ?? localStorage.getItem(LS_FIRST) ?? '',
        lastName: legacy?.lastName ?? localStorage.getItem(LS_LAST) ?? '',
        role: legacy?.role ?? normalizeRole(localStorage.getItem(LS_ROLE) ?? undefined),
        registrationStatus: normalizeRegistrationStatus(
          legacy?.registrationStatus ?? localStorage.getItem(LS_REG),
        ),
      },
      version: 0,
    });
  },
  setItem: (_name, value) => {
    if (typeof localStorage === 'undefined') return;
    try {
      const parsed = JSON.parse(value) as { state?: AuthProfile & { token: string | null } };
      const s = parsed.state;
      if (!s) return;
      if (s.token) {
        localStorage.setItem(LS_TOKEN, s.token);
      } else {
        localStorage.removeItem(LS_TOKEN);
      }
      localStorage.setItem(LS_FIRST, s.firstName ?? '');
      localStorage.setItem(LS_LAST, s.lastName ?? '');
      localStorage.setItem(LS_ROLE, normalizeRole(s.role as string));
      localStorage.setItem(LS_REG, normalizeRegistrationStatus(s.registrationStatus as string));
    } catch {
      /* ignore */
    }
  },
  removeItem: () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_FIRST);
    localStorage.removeItem(LS_LAST);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_REG);
  },
};

const authAxios = axios.create({
  timeout: 25_000,
  headers: { Accept: 'application/json' },
});

function syncAuthAxiosBaseUrl(): void {
  authAxios.defaults.baseURL = resolveAxiosBaseURL();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      firstName: '',
      lastName: '',
      role: 'member',
      registrationStatus: 'active',

      setSession: ({ token, firstName, lastName, role, registrationStatus }) => {
        set({
          token,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: normalizeRole(role),
          registrationStatus: normalizeRegistrationStatus(registrationStatus),
        });
      },

      applyServerProfile: ({ firstName, lastName, role, registrationStatus }) => {
        if (!get().token) return;
        set({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: normalizeRole(role),
          registrationStatus: normalizeRegistrationStatus(registrationStatus),
        });
      },

      clearSession: () => {
        set({
          token: null,
          firstName: '',
          lastName: '',
          role: 'member',
          registrationStatus: 'active',
        });
      },

      login: async (phoneNumber, password) => {
        syncAuthAxiosBaseUrl();
        try {
          const response = await authAxios.post<{
            token?: string;
            user?: {
              first_name?: string;
              last_name?: string;
              app_role?: string;
              registration_status?: string;
            };
            error?: string;
          }>(
            `${AUTH_API_PREFIX}/login`,
            { phone_number: phoneNumber.trim(), password },
            { validateStatus: (s) => s !== undefined && s < 600 },
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
            role: (user.app_role ?? 'member').trim() || 'member',
            registrationStatus: normalizeRegistrationStatus(user.registration_status),
          });

          return { ok: true };
        } catch (e) {
          if (axios.isAxiosError(e)) {
            const msg =
              (e.response?.data as { error?: string } | undefined)?.error ??
              e.message ??
              'Ошибка сети';
            return { ok: false, message: String(msg) };
          }
          return { ok: false, message: 'Не удалось войти.' };
        }
      },

      logout: async () => {
        const token = get().token;
        syncAuthAxiosBaseUrl();
        try {
          if (token) {
            await authAxios.post(
              `${AUTH_API_PREFIX}/logout`,
              null,
              {
                validateStatus: (s) => s !== undefined && s < 500,
                headers: { Authorization: `Bearer ${token}` },
              },
            );
          }
        } catch {
          /* как во Flutter — всё равно чистим локально */
        } finally {
          get().clearSession();
        }
      },
    }),
    {
      name: 'auth',
      storage: createJSONStorage(() => flutterCompatibleStorage),
      partialize: (s) => ({
        token: s.token,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role,
        registrationStatus: s.registrationStatus,
      }),
    },
  ),
);
