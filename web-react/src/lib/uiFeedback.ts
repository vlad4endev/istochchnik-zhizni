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
};

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
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: {
        ...payload,
        message: text,
      },
    }),
  );
}
