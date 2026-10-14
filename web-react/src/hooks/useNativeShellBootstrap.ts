import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { startNativeShell } from '../lib/nativeShell';
import { isNativePlatform } from '../lib/platform';
import { hydrateAuthKeysFromSecureStorage } from '../lib/secureTokenStorage';
import { useAuthStore } from '../features/auth/authStore';

/**
 * Capacitor lifecycle: deep links, back button, network, secure auth hydrate.
 */
export function useNativeShellBootstrap(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform()) return;

    let stop: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const keys = await hydrateAuthKeysFromSecureStorage();
      if (cancelled) return;
      const token = keys.auth_access_token;
      if (token) {
        const state = useAuthStore.getState();
        if (!state.token) {
          state.setSession({
            token,
            firstName: keys.auth_first_name ?? '',
            lastName: keys.auth_last_name ?? '',
            role: (keys.auth_role as never) ?? 'member',
            registrationStatus: (keys.auth_registration_status as never) ?? 'active',
            username: '',
            memberId: null,
          });
        }
      }

      stop = await startNativeShell({
        onAppUrlOpen: (url) => {
          try {
            const u = new URL(url);
            navigate(`${u.pathname}${u.search}${u.hash}`);
          } catch {
            const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
            if (m) navigate(`/${m[1]!.replace(/^\/+/, '')}`);
          }
        },
        onResume: () => {
          window.dispatchEvent(new CustomEvent('app:resume'));
        },
        onPause: () => {
          window.dispatchEvent(new CustomEvent('app:pause'));
        },
        onBackButton: () => {
          // Let React Router handle most cases via history.back in shell.
          return false;
        },
      });
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [navigate]);
}
