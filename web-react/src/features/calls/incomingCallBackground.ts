import { resolvePublicUrl } from '../../lib/resolvePublicUrl';

let lastBrowserNotification: Notification | null = null;
let lastNotifiedCallId: string | null = null;

function toAbsoluteIconUrl(avatarPath: string | null): string | undefined {
  if (!avatarPath?.trim()) return undefined;
  const u = resolvePublicUrl(avatarPath.trim());
  if (!u) return undefined;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (typeof window === 'undefined') return u;
  try {
    return new URL(u, window.location.origin).href;
  } catch {
    return u;
  }
}

/**
 * Вибрация + системное уведомление (если вкладка в фоне и есть разрешение).
 * Вызывать при каждом `call:incoming`.
 */
export function notifyIncomingCallBackground(payload: {
  callId: string;
  callerName: string;
  callType: 'audio' | 'video';
  callerAvatar: string | null;
}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([160, 70, 160, 70, 320]);
    }
  } catch {
    /* ignore */
  }

  if (document.visibilityState !== 'hidden') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    lastBrowserNotification?.close();
    const title = payload.callType === 'video' ? 'Видеозвонок' : 'Входящий звонок';
    const body = (payload.callerName || 'Собеседник').trim() || 'Собеседник';
    const icon =
      toAbsoluteIconUrl(payload.callerAvatar) ??
      (typeof window !== 'undefined' ? `${window.location.origin}/assets/logo.svg` : undefined);
    const badge =
      typeof window !== 'undefined' ? `${window.location.origin}/assets/logo.svg` : undefined;

    const n = new Notification(title, {
      body,
      tag: `istochik-call:${payload.callId}`,
      requireInteraction: true,
      silent: false,
      ...(icon ? { icon } : {}),
      ...(badge ? { badge } : {}),
    });
    lastBrowserNotification = n;
    lastNotifiedCallId = payload.callId;

    n.onclick = () => {
      try {
        n.close();
      } catch {
        /* ignore */
      }
      window.focus();
      window.dispatchEvent(
        new CustomEvent('calls:incoming-notification-click', {
          detail: { callId: payload.callId },
        }),
      );
    };
  } catch {
    /* Safari / приватный режим и т.п. */
  }
}

export function dismissIncomingCallBrowserNotification(callId: string): void {
  if (lastNotifiedCallId !== callId) return;
  try {
    lastBrowserNotification?.close();
  } catch {
    /* ignore */
  }
  lastBrowserNotification = null;
  lastNotifiedCallId = null;
}

/**
 * Запрос разрешения на уведомления в рамках явного жеста пользователя (кнопка звонка и т.д.).
 */
export function requestCallNotificationsFromUserGesture(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  try {
    void Notification.requestPermission();
  } catch {
    /* ignore */
  }
}
