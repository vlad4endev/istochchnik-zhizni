import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

import { useAuthStore } from '../features/auth/authStore';
import { isCookieOnlySessionToken } from '../lib/authSessionConstants';
import { resolveAxiosBaseURL } from '../lib/config';
import { isCapacitorNative } from '../lib/nativeApp';
import { randomUuid } from '../lib/randomId';
import { NativeCall } from '../plugins/nativeCall';

const DEVICE_ID_KEY = 'fcm_push_device_id';

function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return randomUuid();
  }
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id?.trim()) {
    id = randomUuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function postVoipToken(voipToken: string, deviceId: string, sessionToken: string): Promise<boolean> {
  const base = resolveAxiosBaseURL().trim();
  if (!base) return false;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (!isCookieOnlySessionToken(sessionToken)) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  const res = await fetch(`${base}/api/notifications/save-voip-token`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ voip_token: voipToken, device_id: deviceId, platform: 'ios' }),
  });
  return res.ok;
}

/** Регистрирует PushKit VoIP-токен на сервере (только iOS Capacitor). */
export function useVoipTokenSync(): void {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!isCapacitorNative() || Capacitor.getPlatform() !== 'ios') return;
    if (!token?.trim()) return;

    let cancelled = false;
    const deviceId = getOrCreateDeviceId();
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const save = async (voipToken: string) => {
      if (!voipToken.trim() || cancelled) return;
      try {
        await postVoipToken(voipToken.trim(), deviceId, token);
      } catch {
        /* ignore */
      }
    };

    void (async () => {
      try {
        const { supported } = await NativeCall.isSupported();
        if (!supported || cancelled) return;
        handles.push(
          await NativeCall.addListener('voipToken', (ev) => {
            const t = typeof ev.token === 'string' ? ev.token : '';
            void save(t);
          }),
        );
        if (typeof NativeCall.registerVoip === 'function') {
          const res = await NativeCall.registerVoip();
          if (typeof res.token === 'string' && res.token) {
            await save(res.token);
          }
        }
      } catch {
        /* plugin unavailable */
      }
    })();

    return () => {
      cancelled = true;
      for (const h of handles) void h.remove();
    };
  }, [token]);
}
