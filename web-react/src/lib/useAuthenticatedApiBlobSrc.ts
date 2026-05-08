import { useEffect, useState } from 'react';

import { apiClient } from './apiClient';
import { resolveAxiosBaseURL } from './config';

/**
 * У `<video>` / `<audio>` / `<img>` нет заголовка Authorization.
 * Cookie-сессия доходит сама; при сессии только из Bearer нужен запрос через apiClient → blob:-URL.
 */
function needsMessengerAttachmentBlobFetch(url: string): boolean {
  return url.includes('/api/messenger/messages/') && url.includes('/attachment-file');
}

function toRequestPath(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    } catch {
      return url;
    }
  }
  return url;
}

/** Запросы с тем же origin, что и страница: cookie сессии часто привязаны к app, а не к отдельному api-хосту из VITE_API_BASE_URL. */
function samePageOriginBaseURL(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return resolveAxiosBaseURL();
}

/**
 * Для прокси-URL вложений мессенджера возвращает object URL после GET с теми же куками/Bearer,
 * что и остальной API-клиент. Иначе возвращает `src` без изменений.
 */
export function useAuthenticatedApiBlobSrc(src: string | null | undefined): string | null {
  const bypass = typeof src === 'string' && !needsMessengerAttachmentBlobFetch(src);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (!src || bypass) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const path = toRequestPath(src);
        const { data } = await apiClient.get(path, {
          responseType: 'blob',
          baseURL: samePageOriginBaseURL(),
        });
        const objectUrl = URL.createObjectURL(data as Blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [src, bypass]);

  if (!src) return null;
  if (bypass) return src;
  return blobUrl;
}
