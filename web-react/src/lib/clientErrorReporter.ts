/**
 * Lightweight client error sink.
 * Optional Sentry: set VITE_SENTRY_DSN and install `@sentry/browser` in the app.
 */
export function reportClientError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('[client-error]', err.message, context ?? {});
  const dsn = String(import.meta.env.VITE_SENTRY_DSN ?? '').trim();
  if (!dsn || typeof window === 'undefined') return;
  const w = window as Window & {
    Sentry?: { captureException: (e: Error, opts?: { extra?: Record<string, unknown> }) => void };
  };
  if (w.Sentry?.captureException) {
    w.Sentry.captureException(err, { extra: context });
  }
}
