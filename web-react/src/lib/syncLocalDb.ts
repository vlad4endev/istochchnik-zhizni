import { useAuthStore } from '../features/auth/authStore';

import { apiClient } from './apiClient';
import { isLocalDbAvailable } from './localDb';

/**
 * Android: при входе в приложение и при возвращении сети подгружает основные данные с сервера;
 * ответы сохраняются во внутреннюю SQLite (см. lib/localDb) через interceptor apiClient.
 * Чаты сюда не входят — они работают напрямую.
 */
const CORE_ENDPOINTS = [
  '/api/calendar/events',
  '/api/calendar/birthdays/week',
  '/api/calendar/sunday-services',
  '/api/stories',
  '/api/resources/podcasts',
  '/api/sunday-schedule/my',
  '/api/music-schedule/my-schedule',
  '/api/media-schedule/my-schedule',
  '/api/settings/sections',
];

const MIN_SYNC_INTERVAL_MS = 60_000;
let lastSyncAt = 0;
let running = false;

export async function syncLocalDb(): Promise<void> {
  if (!isLocalDbAvailable() || running) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!useAuthStore.getState().token) return;
  if (Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS) return;
  running = true;
  lastSyncAt = Date.now();
  try {
    for (const url of CORE_ENDPOINTS) {
      try {
        await apiClient.get(url, { silentErrorToast: true, skipAuthClearOn401: true });
      } catch {
        /* эндпоинт недоступен для роли или сеть пропала — остальные продолжаем */
      }
    }
  } finally {
    running = false;
  }
}

export function installLocalDbSync(): void {
  if (!isLocalDbAvailable() || typeof window === 'undefined') return;
  window.addEventListener('online', () => void syncLocalDb());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncLocalDb();
  });
  useAuthStore.subscribe((state, prev) => {
    if (!prev.token && state.token) void syncLocalDb();
  });
  void syncLocalDb();
}
