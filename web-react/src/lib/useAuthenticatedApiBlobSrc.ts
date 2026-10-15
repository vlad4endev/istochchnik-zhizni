import { useEffect, useState } from 'react';

import { fetchAuthenticatedBlob, isMessengerAttachmentFileUrl } from './fetchAuthenticatedBlob';

/**
 * У `<video>` / `<audio>` / `<img>` нет заголовка Authorization.
 * Cookie-сессия доходит сама; при сессии только из Bearer нужен запрос через apiClient → blob:-URL.
 * Для прокси-URL вложений мессенджера возвращает object URL; иначе — `src` без изменений.
 */
export function useAuthenticatedApiBlobSrc(src: string | null | undefined): string | null {
  const bypass = typeof src === 'string' && !isMessengerAttachmentFileUrl(src);
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
        const data = await fetchAuthenticatedBlob(src);
        const objectUrl = URL.createObjectURL(data);
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
