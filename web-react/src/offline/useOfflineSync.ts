import { useEffect, useState } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { isBrowserOnline } from './db';
import {
  getOfflineSyncStatus,
  subscribeOfflineSync,
  triggerOfflineSync,
  type OfflineSyncStatus,
} from './syncEngine';

/**
 * Starts IndexedDB ↔ /api/sync when the user is authenticated.
 * Re-syncs on reconnect and background resume.
 */
export function useOfflineSync(): OfflineSyncStatus {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState(getOfflineSyncStatus);

  useEffect(() => subscribeOfflineSync(setStatus), []);

  useEffect(() => {
    if (!token) return;

    if (isBrowserOnline()) {
      triggerOfflineSync();
    }

    const onOnline = () => triggerOfflineSync();
    const onResume = () => {
      if (isBrowserOnline()) triggerOfflineSync();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('app:background-resume', onResume);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('app:background-resume', onResume);
    };
  }, [token]);

  return status;
}

export function OfflineSyncBridge(): null {
  useOfflineSync();
  return null;
}
