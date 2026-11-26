import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PUSH_META_CACHE_NAME,
  isDeployVersionMismatch,
  normalizeBuildVersion,
  purgeServiceWorkerAndCaches,
} from '../src/lib/clientBuildVersion';

describe('clientBuildVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('нормализует BOM и пробелы', () => {
    expect(normalizeBuildVersion('\uFEFFa09e4379\n')).toBe('a09e4379');
  });

  it('считает mismatch только при разных непустых версиях', () => {
    expect(isDeployVersionMismatch('abc', 'abc\n')).toBe(false);
    expect(isDeployVersionMismatch('abc', 'def')).toBe(true);
    expect(isDeployVersionMismatch('abc', '')).toBe(false);
    expect(isDeployVersionMismatch('', 'def')).toBe(false);
  });

  it('purgeServiceWorkerAndCaches обновляет SW без unregister и сохраняет push-meta кэш', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const cachesMock = {
      keys: vi.fn().mockResolvedValue(['workbox-precache-v2', PUSH_META_CACHE_NAME, 'api-cache']),
      delete: deleteCache,
    };

    const unregister = vi.fn().mockResolvedValue(true);
    const update = vi.fn().mockResolvedValue(undefined);
    const controllerListeners = new Set<() => void>();
    const postMessage = vi.fn(() => {
      for (const fn of controllerListeners) fn();
    });

    vi.stubGlobal('caches', cachesMock);
    vi.stubGlobal('window', {
      caches: cachesMock,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          unregister,
          update,
          waiting: { postMessage },
          installing: null,
        }),
        addEventListener: vi.fn((event: string, fn: () => void) => {
          if (event === 'controllerchange') controllerListeners.add(fn);
        }),
        removeEventListener: vi.fn((event: string, fn: () => void) => {
          if (event === 'controllerchange') controllerListeners.delete(fn);
        }),
      },
    });

    await purgeServiceWorkerAndCaches();

    expect(unregister).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v2');
    expect(deleteCache).toHaveBeenCalledWith('api-cache');
    expect(deleteCache).not.toHaveBeenCalledWith(PUSH_META_CACHE_NAME);
  });
});
