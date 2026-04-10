import { useEffect, useRef } from 'react';

type WakeLockSentinel = { release: () => Promise<void> };

/**
 * Удерживает экран включённым (Screen Wake Lock API), пока `enabled === true`.
 * Безопасно для SSR и браузеров без поддержки.
 */
export function useWakeLock(enabled: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;
    const wl = navigator.wakeLock;
    if (!wl?.request) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await wl.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        lockRef.current = sentinel;
      } catch {
        /* пользователь или политика — игнорируем */
      }
    };

    void acquire();

    const onVis = () => {
      if (document.visibilityState === 'visible' && enabled) void acquire();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      const s = lockRef.current;
      lockRef.current = null;
      if (s) void s.release().catch(() => {});
    };
  }, [enabled]);
}
