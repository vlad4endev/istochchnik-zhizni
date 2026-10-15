import { apiClient } from './apiClient';
import { resolveAxiosBaseURL } from './config';

/**
 * Прокси вложений мессенджера требует cookie и/или Bearer.
 * Обычный `fetch` / `<a href>` без Authorization даёт 401 в Bearer-only сессиях (Capacitor/PWA).
 */
export function isMessengerAttachmentFileUrl(url: string): boolean {
  return url.includes('/api/messenger/messages/') && url.includes('/attachment-file');
}

function samePageOriginBaseURL(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return resolveAxiosBaseURL();
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

/**
 * Загружает файл как Blob с теми же credentials/Bearer, что и остальной API.
 * Для `/attachment-file` всегда идёт через apiClient; иначе — CORS fetch.
 */
export async function fetchAuthenticatedBlob(url: string): Promise<Blob> {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) throw new Error('empty url');

  if (isMessengerAttachmentFileUrl(trimmed)) {
    const path = toRequestPath(trimmed);
    const { data } = await apiClient.get(path, {
      responseType: 'blob',
      baseURL: samePageOriginBaseURL(),
      silentErrorToast: true,
    });
    return data as Blob;
  }

  const sameOrigin =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return new URL(trimmed, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    })();

  const res = await fetch(trimmed, {
    mode: 'cors',
    credentials: sameOrigin ? 'include' : 'omit',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}
