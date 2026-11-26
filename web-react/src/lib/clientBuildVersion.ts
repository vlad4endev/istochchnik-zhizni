/**
 * Сверка версии фронта после деплоя.
 * `/build-version.txt` не прекэшируется SW и отдаётся nginx с no-store.
 */

export const CLIENT_BUILD_VERSION_KEY = 'app:client-build-version';
export const CLIENT_BUILD_RELOAD_KEY = 'app:client-build-reload-once';
export const BUILD_VERSION_PATH = '/build-version.txt';
/** Кэш метаданных Web Push в SW — сохраняем при сбросе кэша сборки, чтобы не потерять контекст ротации. */
export const PUSH_META_CACHE_NAME = 'push-meta-v1';

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

/**
 * Очищает устаревшие кэши и запускает мягкое обновление Service Worker.
 * ВАЖНО: намеренно НЕ вызывает `registration.unregister()`, потому что удаление
 * регистрации SW мгновенно аннулирует Web Push подписку пользователя (FCM/APNs).
 */
export async function purgeServiceWorkerAndCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      const keysToDelete = keys.filter((key) => key !== PUSH_META_CACHE_NAME);
      await Promise.race([
        Promise.all(keysToDelete.map((key) => caches.delete(key))),
        new Promise<void>((r) => {
          window.setTimeout(r, 12_000);
        }),
      ]);
    }
  } catch {
    // ignore cache cleanup errors
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await Promise.race([
          registration.update().catch(() => undefined),
          new Promise<void>((r) => {
            window.setTimeout(r, 8000);
          }),
        ]);

        const activateWaiting = async (worker: ServiceWorker): Promise<void> => {
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              navigator.serviceWorker.removeEventListener('controllerchange', finish);
              window.clearTimeout(timer);
              resolve();
            };
            const timer = window.setTimeout(finish, 2000);
            navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
            try {
              worker.postMessage({ type: 'SKIP_WAITING' });
            } catch {
              finish();
            }
          });
        };

        if (registration.waiting) {
          await activateWaiting(registration.waiting);
        } else if (registration.installing) {
          const installing = registration.installing;
          await new Promise<void>((resolve) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              installing.removeEventListener('statechange', onStateChange);
              window.clearTimeout(timer);
              resolve();
            };
            const onStateChange = () => {
              if (installing.state === 'installed' || installing.state === 'redundant') {
                done();
              }
            };
            const timer = window.setTimeout(done, 4000);
            installing.addEventListener('statechange', onStateChange);
            onStateChange();
          });
          if (registration.waiting) {
            await activateWaiting(registration.waiting);
          }
        }
      }
    }
  } catch {
    // ignore service worker update errors
  }
}
