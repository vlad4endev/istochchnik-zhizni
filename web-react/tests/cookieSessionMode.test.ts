import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_ONLY_SESSION_TOKEN } from '../src/lib/authSessionConstants';

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function stubBrowser(opts: { standalone?: boolean; meStatus?: number }) {
  const storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    location: { origin: 'https://app.example' },
    navigator: {},
    matchMedia: (q: string) => ({ matches: Boolean(opts.standalone) && q.includes('standalone') }),
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
  });
  const fetchMock = vi.fn(async () => ({ status: opts.meStatus ?? 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return { storage, fetchMock };
}

const profile = {
  firstName: 'A',
  lastName: 'B',
  role: 'member' as const,
  registrationStatus: 'active' as const,
  username: 'ab',
  memberId: 7,
};

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cookie session mode', () => {
  it('replaces the JWT in localStorage with the marker after a successful probe', async () => {
    const { storage, fetchMock } = stubBrowser({ meStatus: 200 });
    const { useAuthStore } = await import('../src/features/auth/authStore');

    useAuthStore.getState().setSession({ token: 'real.jwt', ...profile }, { freshLogin: true });
    expect(useAuthStore.getState().token).toBe('real.jwt');
    await vi.waitFor(() => expect(useAuthStore.getState().token).toBe(COOKIE_ONLY_SESSION_TOKEN));

    // probe без Authorization
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe('include');
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    expect(storage.getItem('auth_access_token')).toBe(COOKIE_ONLY_SESSION_TOKEN);
    expect(JSON.stringify(storage.dump())).not.toContain('real.jwt');

    // последующий refresh с реальным JWT тоже не пишет его в localStorage
    useAuthStore.getState().setSession({ token: 'rotated.jwt', ...profile });
    expect(useAuthStore.getState().token).toBe(COOKIE_ONLY_SESSION_TOKEN);
    expect(JSON.stringify(storage.dump())).not.toContain('rotated.jwt');
  });

  it('keeps the Bearer token when the cookie does not reach the API', async () => {
    const { storage, fetchMock } = stubBrowser({ meStatus: 401 });
    const { useAuthStore } = await import('../src/features/auth/authStore');

    useAuthStore.getState().setSession({ token: 'real.jwt', ...profile }, { freshLogin: true });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(useAuthStore.getState().token).toBe('real.jwt');
    expect(storage.getItem('auth_cookie_session')).toBeNull();
  });

  it('stays on Bearer in an installed PWA (standalone)', async () => {
    const { fetchMock } = stubBrowser({ standalone: true, meStatus: 200 });
    const { useAuthStore } = await import('../src/features/auth/authStore');

    useAuthStore.getState().setSession({ token: 'real.jwt', ...profile }, { freshLogin: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBe('real.jwt');
  });

  it('a fresh login resets a previously enabled cookie mode', async () => {
    const { storage } = stubBrowser({ meStatus: 401 });
    storage.setItem('auth_cookie_session', '1');
    const { useAuthStore } = await import('../src/features/auth/authStore');

    useAuthStore.getState().setSession({ token: 'new.jwt', ...profile }, { freshLogin: true });
    expect(useAuthStore.getState().token).toBe('new.jwt');
    await new Promise((r) => setTimeout(r, 10));
    expect(useAuthStore.getState().token).toBe('new.jwt');
  });
});
