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
    } else if (s === 'members') {
      void invalidate({ queryKey: ['admin', 'members'] });
      void invalidate({ queryKey: ['admin', 'access-requests'] });
    } else if (s === 'global') {
      void invalidate({ queryKey: ['admin', 'global'] });
    } else if (s === 'templates') {
      void invalidate({ queryKey: ['admin', 'templates'] });
    } else if (s === 'me') {
      void invalidate({ queryKey: ['auth', 'me'] });
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

    connect();

    return () => {
      stopped = true;
      clearTimer();
      ws?.close();
    };
  }, [token]);
}
