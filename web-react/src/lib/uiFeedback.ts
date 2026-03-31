export type AppToastKind = 'error' | 'info' | 'success';

export function emitAppToast(message: string, kind: AppToastKind = 'error'): void {
  if (typeof window === 'undefined') return;
  const text = String(message || '').trim();
  if (!text) return;
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: { message: text, kind },
    }),
  );
}
