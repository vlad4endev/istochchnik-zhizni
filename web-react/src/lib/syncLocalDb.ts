import { useAuthStore } from '../features/auth/authStore';

import { apiClient } from './apiClient';
import { isLocalDbAvailable, outboxList, outboxMarkFailed, outboxRemove } from './localDb';

/**
 * Android: после входа по номеру и паролю, при запуске и при возвращении сети подгружает с сервера
 * личные данные пользователя (по его id) и общецерковные; сервер отдаёт то, что доступно его роли;
 * ответы сохраняются во внутреннюю SQLite (см. lib/localDb) через interceptor apiClient.
 * Чаты сюда не входят — они работают напрямую.
 */
/** Общецерковные данные: одинаковы для всех, кого пускает роль. */
const CHURCH_ENDPOINTS = [
  '/api/calendar/events',
  '/api/calendar/birthdays/week',
  '/api/calendar/sunday-services',
  '/api/stories',
  '/api/resources/podcasts',
  '/api/broadcasts/active',
  '/api/songs',
  '/api/settings/sections',
  '/api/settings/role-permissions',
];

function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Личные данные того, кто вошёл: профиль, свои расписания, уведомления — по токену/id участника. */
function personalEndpoints(): string[] {
  const memberId = useAuthStore.getState().memberId;
  return [
    '/api/auth/me',
    ...(memberId ? [`/api/profile/${memberId}`] : []),
    '/api/sunday-schedule/my',
    '/api/music-schedule/my-schedule',
    '/api/media-schedule/my-schedule',
    '/api/notifications/unread-deliveries-count',
    '/api/notifications/status',
    `/api/dashboard/bundle?date=${todayKey()}`,
  ];
}

const MIN_SYNC_INTERVAL_MS = 60_000;
let lastSyncAt = 0;
let running = false;

/** Отправляет на сервер действия, сделанные без сети, по порядку. Сеть пропала — оставляем остальное. */
async function flushOutbox(): Promise<void> {
  for (const item of await outboxList()) {
    try {
      await apiClient.request({
        method: item.method,
        url: item.url,
        data: item.body,
        headers: item.idemKey ? { 'Idempotency-Key': item.idemKey } : undefined,
        silentErrorToast: true,
        skipAuthClearOn401: true,
        skipLocalOutbox: true,
      });
      await outboxRemove(item.id);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === undefined) return; // нет сети — продолжим позже
      if (status === 401 || status === 408 || status === 429 || status >= 500) {
        await outboxMarkFailed(item.id);
        if (status === 401 || status >= 500) return;
      } else {
        await outboxRemove(item.id); // 4xx: сервер отклонил, повтор не поможет
      }
    }
  }
}

export async function syncLocalDb(): Promise<void> {
  if (!isLocalDbAvailable() || running) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!useAuthStore.getState().token) return;
  running = true;
  try {
    // Очередь действий уходит сразу, как только вернулась сеть, — без паузы между синхронизациями.
    await flushOutbox();
    if (Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS) return;
    lastSyncAt = Date.now();
    for (const url of [...personalEndpoints(), ...CHURCH_ENDPOINTS]) {
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
