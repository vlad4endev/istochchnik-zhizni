import { useEffect, useState } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { resolveMessengerWebOrigin } from '../lib/config';

/**
 * Бейдж непрочитанных на основном сайте, когда API чатов на другом origin (поддомен).
 */
export function useMessengerUnreadHint(): number {
  const token = useAuthStore((s) => s.token);
  const origin = typeof window !== 'undefined' ? resolveMessengerWebOrigin() : '';
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token || !origin) {
      setCount(0);
      return;
    }

    let cancelled = false;

    const load = () => {
      void fetch(`${origin}/api/messenger/unread-count`, {
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unread'))))
        .then((d: { count?: unknown }) => {
          if (cancelled) return;
          const n = Number(d?.count);
          setCount(Number.isFinite(n) && n > 0 ? n : 0);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };

    load();
    const id = window.setInterval(load, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token, origin]);

  return origin ? count : 0;
}
