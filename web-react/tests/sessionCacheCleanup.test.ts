import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUuid } from '../src/lib/randomId';
import { installSessionCacheCleanup, purgeApiCaches } from '../src/lib/sessionCacheCleanup';

type S = { token: string | null };

function fakeStore() {
  let listener: ((s: S, p: S) => void) | null = null;
  return {
    subscribe: (l: (s: S, p: S) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    emit: (s: S, p: S) => listener?.(s, p),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installSessionCacheCleanup', () => {
  it('clears query cache and api caches only when token goes from set to null', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['api-cache-abc', 'api-cache', 'images-cache-abc', 'google-fonts-abc'],
      delete: async (n: string) => {
        deleted.push(n);
        return true;
      },
    });
    const qc = new QueryClient();
    qc.setQueryData(['x'], 1);
    const store = fakeStore();
    installSessionCacheCleanup(store, qc);

    store.emit({ token: 't2' }, { token: 't1' }); // refresh
    store.emit({ token: 't' }, { token: null }); // login
    expect(qc.getQueryData(['x'])).toBe(1);

    store.emit({ token: null }, { token: 't' }); // logout / 401
    expect(qc.getQueryData(['x'])).toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(deleted.sort()).toEqual(['api-cache', 'api-cache-abc']);
  });

  it('purgeApiCaches tolerates missing Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(purgeApiCaches()).resolves.toBeUndefined();
  });
});

describe('randomUuid', () => {
  it('falls back to a valid v4 uuid without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.map(() => 255) });
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('uses native randomUUID when present', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'native' });
    expect(randomUuid()).toBe('native');
  });
});
