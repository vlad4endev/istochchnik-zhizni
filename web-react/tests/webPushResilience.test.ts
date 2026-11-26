import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('../src/features/profile/api', () => ({
  fetchVapidPublicKey: vi.fn(),
}));

vi.mock('../src/features/pwa/ensureServiceWorker', () => ({
  ensureServiceWorkerRegistered: vi.fn(),
}));

import { apiClient } from '../src/lib/apiClient';
import { fetchVapidPublicKey } from '../src/features/profile/api';
import { ensureServiceWorkerRegistered } from '../src/features/pwa/ensureServiceWorker';
import {
  initMessengerPushNotifications,
  isRetryablePushError,
  resetWebPushSyncCache,
} from '../src/features/messenger/push/webPush';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('isRetryablePushError', () => {
  it('считает 401, 429, 5xx и сетевые ошибки временными', () => {
    expect(isRetryablePushError({ response: { status: 401 } })).toBe(true);
    expect(isRetryablePushError({ response: { status: 429 } })).toBe(true);
    expect(isRetryablePushError({ response: { status: 502 } })).toBe(true);
    expect(isRetryablePushError(new Error('Network Error'))).toBe(true);
  });

  it('не считает 400/403 и NotAllowedError временными', () => {
    expect(isRetryablePushError({ response: { status: 400 } })).toBe(false);
    expect(isRetryablePushError({ response: { status: 403 } })).toBe(false);
    const denied = new Error('denied');
    denied.name = 'NotAllowedError';
    expect(isRetryablePushError(denied)).toBe(false);
  });
});

describe('initMessengerPushNotifications resilience', () => {
  const VALID_VAPID =
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

  afterEach(() => {
    resetWebPushSyncCache();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function setupBrowserMocks(unsubscribe: ReturnType<typeof vi.fn>, existingSub?: unknown) {
    const controllerPostMessage = vi.fn();
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      expirationTime: null,
      options: {},
      getKey: vi.fn(() => null),
      toJSON: vi.fn(() => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
        keys: { p256dh: 'p256-key', auth: 'auth-key' },
      })),
      unsubscribe,
    };

    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existingSub ?? null),
        subscribe: vi.fn().mockResolvedValue(sub),
      },
      active: { postMessage: vi.fn() },
    };

    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('PushManager', function PushManager() {});
    vi.stubGlobal('window', {
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'TestAgent/1.0',
      serviceWorker: {
        ready: Promise.resolve(registration),
        controller: { postMessage: controllerPostMessage },
      },
    });

    vi.mocked(ensureServiceWorkerRegistered).mockResolvedValue(
      registration as unknown as ServiceWorkerRegistration,
    );
    vi.mocked(fetchVapidPublicKey).mockResolvedValue(VALID_VAPID);

    return { controllerPostMessage, registration };
  }

  it('не уничтожает подписку при временной ошибке 503 и помечает результат retryable', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    setupBrowserMocks(unsubscribe);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 503 } });

    const res = await initMessengerPushNotifications({ force: true, silent: true });
    expect(res.ok).toBe(false);
    expect(res.retryable).toBe(true);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('не уничтожает подписку при 401 на холодном старте и помечает результат retryable', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    setupBrowserMocks(unsubscribe);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 401 } });

    const res = await initMessengerPushNotifications({ force: true, silent: true });
    expect(res.ok).toBe(false);
    expect(res.retryable).toBe(true);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('отписывается только при явном 400 Invalid subscription от сервера', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    setupBrowserMocks(unsubscribe);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 400 } });

    const res = await initMessengerPushNotifications({ force: true, silent: true });
    expect(res.ok).toBe(false);
    expect(res.retryable).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('передаёт метаданные подписки в SW после успешного сохранения', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const { controllerPostMessage } = setupBrowserMocks(unsubscribe);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { ok: true } });

    const res = await initMessengerPushNotifications({ force: true, silent: true });
    expect(res.ok).toBe(true);
    expect(controllerPostMessage).toHaveBeenCalledWith({
      type: 'push:remember-subscription',
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      auth: 'auth-key',
    });
  });

  function makeExistingSub(unsubscribe: ReturnType<typeof vi.fn>, expirationTime: number | null) {
    return {
      endpoint: 'https://fcm.googleapis.com/fcm/send/existing',
      expirationTime,
      options: {},
      getKey: vi.fn(() => null),
      toJSON: vi.fn(() => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/existing',
        keys: { p256dh: 'p256-old', auth: 'auth-old' },
      })),
      unsubscribe,
    };
  }

  it('пересоздаёт подписку заранее, когда expirationTime истекает через < 3 суток', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const existingSub = makeExistingSub(unsubscribe, Date.now() + 60 * 60_000);
    const { registration } = setupBrowserMocks(unsubscribe, existingSub);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { ok: true } });

    const res = await initMessengerPushNotifications({ force: true, silent: true });
    expect(res.ok).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
  });

  it('не пересоздаёт подписку с далёким expirationTime', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const existingSub = makeExistingSub(unsubscribe, Date.now() + 30 * 24 * 3600_000);
    const { registration } = setupBrowserMocks(unsubscribe, existingSub);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { ok: true } });

    const res = await initMessengerPushNotifications({ force: true, silent: true });
    expect(res.ok).toBe(true);
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });
});
