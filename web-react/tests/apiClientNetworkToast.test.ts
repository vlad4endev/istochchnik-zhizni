import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts: Array<{ message?: string }> = [];

vi.mock('../src/lib/uiFeedback', () => ({
  emitAppToast: (input: string | { message?: string }) => {
    if (typeof input === 'string') toasts.push({ message: input });
    else toasts.push({ message: input?.message });
  },
}));

vi.mock('../src/lib/authRefresh', () => ({
  performAuthRefresh: vi.fn(async () => ({ status: 'unauthorized' as const })),
}));

import { useAuthStore } from '../src/features/auth/authStore';
import { apiClient } from '../src/lib/apiClient';
import {
  beginSessionTeardown,
  resetSessionTeardownForTests,
} from '../src/lib/sessionTeardown';

type FailMode = 'network' | 'timeout' | 'unauthorized';

function installFailingAdapter(mode: FailMode): () => void {
  const prev = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config) => {
    const cfg = config as InternalAxiosRequestConfig;
    if (mode === 'unauthorized') {
      const err = new AxiosError('Unauthorized');
      err.config = cfg;
      err.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: cfg,
        data: { error: 'Unauthorized' },
      };
      throw err;
    }
    const err = new AxiosError(mode === 'timeout' ? 'timeout of 25000ms exceeded' : 'Network Error');
    err.config = cfg;
    err.code = mode === 'timeout' ? 'ECONNABORTED' : 'ERR_NETWORK';
    throw err;
  };
  return () => {
    apiClient.defaults.adapter = prev;
  };
}

describe('apiClient network / logout toasts', () => {
  let restoreAdapter: (() => void) | undefined;

  beforeEach(() => {
    toasts.length = 0;
    resetSessionTeardownForTests();
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('navigator', { onLine: true });
    useAuthStore.setState({
      token: 'test-access-token',
      role: 'admin',
      roles: ['admin'],
      registrationStatus: 'active',
      firstName: 'A',
      lastName: 'B',
      username: 'admin',
      memberId: 1,
    });
  });

  afterEach(() => {
    restoreAdapter?.();
    restoreAdapter = undefined;
    resetSessionTeardownForTests();
    useAuthStore.setState({ token: null });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not toast "Нет связи" while session teardown is active', async () => {
    beginSessionTeardown();
    restoreAdapter = installFailingAdapter('network');

    await expect(apiClient.get('/api/ping')).rejects.toBeTruthy();
    expect(toasts.some((t) => String(t.message ?? '').includes('Нет связи с сервером'))).toBe(false);
  });

  it('does not toast "Нет связи" after session already cleared', async () => {
    useAuthStore.setState({ token: null });
    restoreAdapter = installFailingAdapter('network');

    await expect(apiClient.get('/api/ping')).rejects.toBeTruthy();
    expect(toasts.some((t) => String(t.message ?? '').includes('Нет связи с сервером'))).toBe(false);
  });

  it('does not toast session-expired on 401 during teardown', async () => {
    beginSessionTeardown();
    restoreAdapter = installFailingAdapter('unauthorized');

    await expect(apiClient.get('/api/secure')).rejects.toBeTruthy();
    expect(toasts.some((t) => String(t.message ?? '').includes('Сессия недействительна'))).toBe(false);
  });

  it('does not toast "Нет связи" for request timeouts', async () => {
    restoreAdapter = installFailingAdapter('timeout');

    await expect(apiClient.get('/api/slow')).rejects.toBeTruthy();
    expect(toasts.some((t) => String(t.message ?? '').includes('Нет связи с сервером'))).toBe(false);
  });

  it('still surfaces connectivity toast for ERR_NETWORK while logged in', async () => {
    vi.useFakeTimers();
    restoreAdapter = installFailingAdapter('network');

    const pending = apiClient.get('/api/ping').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(800);
    await pending;

    expect(toasts.some((t) => String(t.message ?? '').includes('Нет связи с сервером'))).toBe(true);
  });
});
