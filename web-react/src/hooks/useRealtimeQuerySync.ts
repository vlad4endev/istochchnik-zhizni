import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { keys } from '../lib/queryKeys';
import { subscribeRealtimeMessages } from '../lib/realtimeWsClient';

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
      void invalidate({ queryKey: keys.me });
    } else if (s === 'broadcast') {
      void invalidate({ queryKey: keys.broadcast });
    } else if (s === 'resources') {
      void invalidate({ queryKey: ['resources'] });
    } else if (s === 'notification-settings') {
      void invalidate({ queryKey: keys.notifications });
    } else if (s === 'admin') {
      void invalidate({ queryKey: ['admin'] });
    } else if (s === 'service-planner') {
      void invalidate({
        predicate: (q) => Array.isArray(q.queryKey) && String(q.queryKey[0] ?? '').startsWith('service-planner'),
      });
      void invalidate({ queryKey: ['editable-service-plan'] });
      void invalidate({ queryKey: ['editable-service-plan-meta'] });
      void invalidate({ queryKey: ['public', 'service-plan'] });
      void invalidate({ queryKey: ['songs', 'service-planner'] });
    }
  }
}

/**
 * Инвалидация React Query по общему WebSocket (`useRealtimeWsConnection` в Layout).
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

    return subscribeRealtimeMessages((raw) => {
      try {
        const msg = raw as InvalidateMessage;
        if (msg.type === 'ready' || msg.type === 'pong') {
          return;
        }
        if (msg.v !== 1 || msg.type !== 'invalidate' || !Array.isArray(msg.scopes)) {
          return;
        }
        applyScopes(msg.scopes, qcRef.current.invalidateQueries);
      } catch {
        /* некорректное сообщение */
      }
    });
  }, [token]);
}
