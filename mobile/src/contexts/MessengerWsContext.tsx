import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import {
  connectRealtimeWs,
  disconnectRealtimeWs,
  subscribeRealtimeWs,
} from '../lib/realtimeWs';
import { useAuthStore } from '../stores/authStore';

const MessengerWsContext = createContext(true);

export function MessengerWsProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      disconnectRealtimeWs();
      return;
    }
    connectRealtimeWs(token);
    return () => {
      disconnectRealtimeWs();
    };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    return subscribeRealtimeWs((msg) => {
      const type = typeof msg.type === 'string' ? msg.type : '';

      if (
        type === 'msg:new' ||
        type === 'msg:edited' ||
        type === 'msg:deleted' ||
        type === 'msg:reaction' ||
        type === 'msg:poll' ||
        type === 'read:updated' ||
        type === 'messages_read'
      ) {
        const convId = typeof msg.conversationId === 'string' ? msg.conversationId : null;
        if (convId) {
          void queryClient.invalidateQueries({ queryKey: ['messenger', 'messages', convId] });
        }
        void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['messenger', 'unread'] });
      }

      if (type === 'conv:created' || type === 'conv:updated') {
        void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['messenger', 'unread'] });
      }
    });
  }, [token, queryClient]);

  return <MessengerWsContext.Provider value={true}>{children}</MessengerWsContext.Provider>;
}

export function useMessengerWsConnected(): boolean {
  return useContext(MessengerWsContext);
}
