import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  outbox: [] as Array<{ method: string; url: string; body: unknown; idemKey: string | null }>,
}));

vi.mock('./localDb', () => ({
  isLocalDbAvailable: () => true,
  isQueueableWrite: (m: string | undefined, u: string | undefined) =>
    (m ?? '').toLowerCase() === 'post' && (u ?? '').includes('/prayer-need/submit'),
  newIdempotencyKey: () => 'test-key-0123456789abcdef',
  localDbPut: async (u: string, b: unknown) => void store.cache.set(u, b),
  localDbGet: async (u: string) => (store.cache.has(u) ? { body: store.cache.get(u), savedAt: 1 } : null),
  outboxAdd: async (method: string, url: string, body: unknown, idemKey: string | null) => {
    store.outbox.push({ method, url, body, idemKey });
    return true;
  },
}));

import { apiClient } from './apiClient';

function offlineAdapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config, isAxiosError: true }));
}

describe('apiClient без сети (Android)', () => {
  beforeEach(() => {
    store.cache.clear();
    store.outbox.length = 0;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  });

  it('GET отдаёт последний сохранённый ответ', async () => {
    store.cache.set('/api/calendar/events', [{ id: 1 }]);
    const res = await apiClient.get('/api/calendar/events', { adapter: offlineAdapter() });
    expect(res.data).toEqual([{ id: 1 }]);
    expect(res.headers['x-local-db']).toBeDefined();
  });

  it('GET без сохранённых данных падает как раньше', async () => {
    await expect(apiClient.get('/api/stories', { adapter: offlineAdapter() })).rejects.toBeTruthy();
  });

  it('безопасная запись ставится в очередь с ключом идемпотентности', async () => {
    const res = await apiClient.post('/api/calendar/prayer-need/submit', { text: 'x' }, { adapter: offlineAdapter() });
    expect(res.status).toBe(202);
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0].idemKey).toBe('test-key-0123456789abcdef');
    expect(store.outbox[0].body).toEqual({ text: 'x' });
  });

  it('остальные записи без сети падают и в очередь не попадают', async () => {
    await expect(apiClient.post('/api/posts', { a: 1 }, { adapter: offlineAdapter() })).rejects.toBeTruthy();
    expect(store.outbox).toHaveLength(0);
  });
});
