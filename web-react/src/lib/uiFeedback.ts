export type AppToastKind = 'error' | 'info' | 'success';

export type AppToastAction = {
  event: string;
  detail?: Record<string, unknown>;
};

export type AppToastPayload = {
  message: string;
  kind?: AppToastKind;
  title?: string;
  avatarUrl?: string | null;
  avatarText?: string;
  action?: AppToastAction;
  /** Длительность показа (мс), по умолчанию 4200 — например 5200 для «Отменить». */
  durationMs?: number;
  /**
   * Только для администраторов приложения: технические / API сообщения, не для обычных пользователей.
   * Фильтр в `AppToastHost` (см. `isAppAdministratorSession`).
   */
  adminOnly?: boolean;
};

/**
 * Перехватчик тостов: возвращает true, если показал уведомление сам (например, окно звонка
 * поверх приложения — модальный тост оказался бы под ним и всплыл бы уже после звонка).
 */
type AppToastInterceptor = (payload: AppToastPayload) => boolean;
let toastInterceptor: AppToastInterceptor | null = null;

/** Установить перехватчик; возвращает функцию снятия (снимает только «свой»). */
export function setAppToastInterceptor(fn: AppToastInterceptor): () => void {
  toastInterceptor = fn;
  return () => {
    if (toastInterceptor === fn) toastInterceptor = null;
  };
}

export function emitAppToast(message: string, kind?: AppToastKind): void;
export function emitAppToast(payload: AppToastPayload): void;
export function emitAppToast(
  input: string | AppToastPayload,
  kind: AppToastKind = 'error',
): void {
  if (typeof window === 'undefined') return;
  const payload: AppToastPayload =
    typeof input === 'string'
      ? { message: input, kind }
      : {
          ...input,
          kind: input.kind ?? 'error',
        };
  const text = String(payload.message || '').trim();
  if (!text) return;
  // adminOnly-фильтр живёт в AppToastHost — такие тосты не перехватываем.
  if (!payload.adminOnly && toastInterceptor?.({ ...payload, message: text })) return;
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: {
        ...payload,
        message: text,
      },
    }),
  );
}
