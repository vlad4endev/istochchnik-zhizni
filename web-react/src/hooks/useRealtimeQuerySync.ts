import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { resolveRealtimeWebSocketUrl } from '../lib/config';

type InvalidateMessage = {
  v?: number;
  type?: string;
  scopes?: string[];
};

function applyScopes(scopes: string[], invalidate: QueryClient['invalidateQueries']) {
  for (const s of scopes) {
    if (s === 'calendar') {
      void invalidate({ queryKey: ['calendar'] });
      void invalidate({ queryKey: ['admin', 'events'] });
    } else if (s === 'coordinator-notes') {
      void invalidate({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
    } else if (s === 'members') {
      void invalidate({ queryKey: ['admin', 'members'] });
      void invalidate({ queryKey: ['admin', 'access-requests'] });
      void invalidate({ queryKey: ['admin', 'prayer-history'] });
    } else if (s === 'global') {
      void invalidate({ queryKey: ['admin', 'global'] });
    } else if (s === 'templates') {
      void invalidate({ queryKey: ['admin', 'templates'] });
    } else if (s === 'me') {
      void invalidate({ queryKey: ['auth', 'me'] });
    } else if (s === 'broadcast') {
      void invalidate({ queryKey: ['broadcast'] });
    } else if (s === 'resources') {
      void invalidate({ queryKey: ['resources'] });
    } else if (s === 'notification-settings') {
      void invalidate({ queryKey: ['notification-settings'] });
    } else if (s === 'admin') {
      void invalidate({ queryKey: ['admin'] });
    }
  }
}

/**
 * WebSocket `/api/realtime`: после изменений на сервере инвалидирует React Query — данные подтягиваются без ручного обновления.
 */
export function useRealtimeQuerySync(): void {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    if (!token) {
      return;
    }

    const url = resolveRealtimeWebSocketUrl();
    if (!url) {
      return;
    }

    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;

    const clearTimer = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      clearTimer();
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      reconnectTimer = window.setTimeout(() => {
        connect();
      }, delay);
    };

    function connect() {
      if (stopped) return;
      clearTimer();
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        ws?.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as InvalidateMessage;
          if (msg.type === 'ready') {
            return;
          }
          if (msg.v !== 1 || msg.type !== 'invalidate' || !Array.isArray(msg.scopes)) {
            return;
          }
          applyScopes(msg.scopes, qcRef.current.invalidateQueries);
        } catch {
          /* некорректное сообщение */
        }
      };

      ws.onclose = () => {
        ws = null;
        if (!stopped) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    const handleOnline = () => {
      if (stopped) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      clearTimer();
      connect();
    };

    const handleOffline = () => {
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (stopped) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      clearTimer();
      connect();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();

    return () => {
      stopped = true;
      clearTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ws?.close();
    };
  }, [token]);
}
