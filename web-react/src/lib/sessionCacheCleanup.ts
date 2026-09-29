import type { QueryClient } from '@tanstack/react-query';

/** Имена runtime-кэшей SW с ответами `/api/*` (`api-cache-<tag>` и старый `api-cache`). */
const API_CACHE_PREFIX = 'api-cache';

/** Удаляет из Cache Storage кэшированные ответы API — они не привязаны к пользователю. */
export async function purgeApiCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((name) => name.startsWith(API_CACHE_PREFIX)).map((name) => caches.delete(name)),
    );
  } catch {
    /* Cache Storage недоступен — нечего чистить */
  }
}

type TokenSubscribable = {
  subscribe: (listener: (state: { token: string | null }, prev: { token: string | null }) => void) => () => void;
};

/**
 * При выходе из сессии (logout, 401, синхронизация между вкладками) — токен становится null —
 * сбрасывает кэш React Query и API-кэш Service Worker, чтобы следующий пользователь
 * на этом устройстве не увидел данные предыдущего.
 */
export function installSessionCacheCleanup(
  authStore: TokenSubscribable,
  queryClient: QueryClient,
): () => void {
  return authStore.subscribe((state, prev) => {
    if (prev.token && !state.token) {
      void queryClient.cancelQueries();
      queryClient.clear();
      void purgeApiCaches();
    }
  });
}
