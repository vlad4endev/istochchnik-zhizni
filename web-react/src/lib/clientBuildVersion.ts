/**
 * Сверка версии фронта после деплоя.
 * `/build-version.txt` не прекэшируется SW и отдаётся nginx с no-store.
 */

export const CLIENT_BUILD_VERSION_KEY = 'app:client-build-version';
export const CLIENT_BUILD_RELOAD_KEY = 'app:client-build-reload-once';
export const BUILD_VERSION_PATH = '/build-version.txt';

export function resolveClientBuildVersion(): string {
  if (typeof __CLIENT_BUILD_VERSION__ === 'string' && __CLIENT_BUILD_VERSION__.trim()) {
    return __CLIENT_BUILD_VERSION__.trim();
  }
  if (typeof __WEB_REACT_BUILD_STAMP__ === 'string' && __WEB_REACT_BUILD_STAMP__.trim()) {
    return __WEB_REACT_BUILD_STAMP__.trim();
  }
  return 'dev';
}

export function normalizeBuildVersion(raw: string): string {
  return raw.replace(/^\uFEFF/, '').trim();
}

/** true — на сервере другая сборка, клиенту нужно сбросить кэш и перезагрузиться. */
export function isDeployVersionMismatch(localVersion: string, remoteRaw: string): boolean {
  const remote = normalizeBuildVersion(remoteRaw);
  if (!remote || !localVersion) return false;
  return remote !== localVersion;
}

export async function fetchRemoteBuildVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = `${BUILD_VERSION_PATH}?_=${Date.now()}`;
  const res = await fetchImpl(url, {
    cache: 'no-store',
    headers: { Accept: 'text/plain' },
  });
  if (!res.ok) return null;
  return normalizeBuildVersion(await res.text());
}

export async function purgeServiceWorkerAndCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await Promise.race([
          registration.unregister(),
          new Promise<void>((r) => {
            window.setTimeout(r, 8000);
          }),
        ]);
      }
    }
  } catch {
    // ignore service worker errors
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.race([
        Promise.all(keys.map((key) => caches.delete(key))),
        new Promise<void>((r) => {
          window.setTimeout(r, 12_000);
        }),
      ]);
    }
  } catch {
    // ignore cache cleanup errors
  }
}
