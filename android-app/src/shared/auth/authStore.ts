import {create} from 'zustand';

import {setApiTokenGetter, setAuthRefreshHandler} from '../apiClient';
import {
  fetchMe,
  loginRequest,
  logoutRequest,
  refreshTokenRequest,
} from './authApi';
import type {AuthProfile} from './types';
import {loadSecureToken} from '../storage/secureStorage';

interface AuthState extends AuthProfile {
  token: string | null;
  hydrated: boolean;
  setSession: (session: {token: string} & AuthProfile) => void;
  applyServerProfile: (profile: AuthProfile) => void;
  clearSession: () => void;
  login: (phone: string, password: string) => Promise<{ok: true} | {ok: false; message: string}>;
  logout: () => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
}

const emptyProfile: AuthProfile = {
  firstName: '',
  lastName: '',
  role: 'member',
  registrationStatus: 'active',
  username: '',
  memberId: null,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  ...emptyProfile,
  token: null,
  hydrated: false,

  setSession: session => {
    set({
      token: session.token,
      firstName: session.firstName,
      lastName: session.lastName,
      role: session.role,
      roles: session.roles,
      registrationStatus: session.registrationStatus,
      username: session.username,
      memberId: session.memberId,
    });
  },

  applyServerProfile: profile => {
    set({
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      roles: profile.roles,
      registrationStatus: profile.registrationStatus,
      username: profile.username,
      memberId: profile.memberId,
    });
  },

  clearSession: () => {
    set({...emptyProfile, token: null});
  },

  login: async (phone, password) => {
    const result = await loginRequest(phone, password);
    if (!result.ok) return result;
    get().setSession({token: result.token, ...result.profile});
    return {ok: true};
  },

  logout: async () => {
    await logoutRequest();
    get().clearSession();
  },

  hydrateFromStorage: async () => {
    try {
      const token = await loadSecureToken();
      if (!token) {
        set({hydrated: true});
        return;
      }
      set({token});
      const profile = await fetchMe();
      if (profile) {
        get().applyServerProfile(profile);
      }
    } catch {
      get().clearSession();
    } finally {
      set({hydrated: true});
    }
  },
}));

setApiTokenGetter(() => useAuthStore.getState().token);
setAuthRefreshHandler(async () => {
  const token = await refreshTokenRequest();
  if (token) {
    useAuthStore.getState().setSession({
      token,
      firstName: useAuthStore.getState().firstName,
      lastName: useAuthStore.getState().lastName,
      role: useAuthStore.getState().role,
      roles: useAuthStore.getState().roles,
      registrationStatus: useAuthStore.getState().registrationStatus,
      username: useAuthStore.getState().username,
      memberId: useAuthStore.getState().memberId,
    });
  }
  return token;
});
