import { useEffect, useState } from 'react';
import { sendRealtimeJson, subscribeRealtimeMessages } from '../lib/realtimeWsClient';
import { useAuthStore } from '../features/auth/authStore';

/**
 * Возвращает количество участников, смотрящих трансляцию прямо сейчас.
 *
 * @param watching - если true, регистрирует текущего пользователя как зрителя.
 *   Используется на странице /broadcast.
 *   На дашборде используется без флага — только для отображения счётчика.
 */
export function useBroadcastViewers(opts?: { watching?: boolean }): number | null {
  const [count, setCount] = useState<number | null>(null);
  const token = useAuthStore((s) => s.token);
  const watching = opts?.watching ?? false;

  useEffect(() => {
    if (!token) return;

    const unsub = subscribeRealtimeMessages((raw) => {
      const msg = raw as { type?: string; count?: number };
      if (msg.type === 'broadcast:viewer_count' && typeof msg.count === 'number') {
        setCount(msg.count);
        return;
      }
      // При получении ready (начало сессии или реконнект) заново регистрируемся как зритель.
      if (msg.type === 'ready' && watching) {
        sendRealtimeJson({ type: 'watch_broadcast' });
      }
    });

    return () => {
      unsub();
      if (watching) {
        sendRealtimeJson({ type: 'unwatch_broadcast' });
      }
    };
  }, [token, watching]);

  return count;
}
