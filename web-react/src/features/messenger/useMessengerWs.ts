import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../auth/authStore';
import { sendRealtimeJson, subscribeRealtimeMessages, subscribeRealtimeOpen, notifyActiveMessengerConversationId } from '../../lib/realtimeWsClient';
import { useChatStore, isDraftPrivateConversationId } from './chatStore';
import type { WsInboundMessage } from './chatStoreWsBatch';

function emitMessengerMetric(name: string, value: number, context?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('messenger:metric', {
      detail: { name, value, context: context ?? {} },
    }),
  );
}

/**
 * Маршрутизирует события мессенджера из общего WebSocket в Zustand.
 * Само подключение — в `useRealtimeWsConnection()` (Layout).
 */
export function useMessengerWs(): {
  sendTypingStart: (conversationId: string) => void;
  sendTypingStop: (conversationId: string) => void;
} {
  const token = useAuthStore((s) => s.token);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<Record<string, number>>({});

  const sendTypingStart = useCallback((conversationId: string) => {
    const now = Date.now();
    const last = lastTypingSentRef.current[conversationId] ?? 0;

    if (now - last > 1500) {
      sendRealtimeJson({ type: 'typing:start', conversationId });
      lastTypingSentRef.current[conversationId] = now;
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendRealtimeJson({ type: 'typing:stop', conversationId });
      delete lastTypingSentRef.current[conversationId];
    }, 3000);
  }, []);

  const sendTypingStop = useCallback((conversationId: string) => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    sendRealtimeJson({ type: 'typing:stop', conversationId });
  }, []);

  useEffect(() => {
    if (!token) {
      notifyActiveMessengerConversationId(null);
      return;
    }
    let lastSynced: string | null | undefined;
    const syncActiveConv = () => {
      const id = useChatStore.getState().activeConversationId;
      if (id === lastSynced) return;
      lastSynced = id;
      notifyActiveMessengerConversationId(id);
    };
    syncActiveConv();
    return useChatStore.subscribe(syncActiveConv);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const queue: WsInboundMessage[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (!queue.length) return;
      const batch = queue.splice(0, queue.length);
      useChatStore.getState().handleWsMessageBatch(batch);
    };
    const unsubMsg = subscribeRealtimeMessages((msg) => {
      queue.push(msg as WsInboundMessage);
      if (flushTimer == null) {
        flushTimer = setTimeout(flush, 16);
      }
    });
    const unsubOpen = subscribeRealtimeOpen(({ wasReconnected }) => {
      const openedAt = performance.now();
      const store = useChatStore.getState();
      const activeConversationId = store.activeConversationId;
      const activeMessages = activeConversationId
        ? (store.messagesByConv[activeConversationId] || [])
        : [];

      const shouldResyncConversations = wasReconnected || !store.conversationsLoaded;

      if (shouldResyncConversations) {
        void store.loadConversations({ force: wasReconnected });
      }

      const actId = activeConversationId;
      const isDraft = actId != null && isDraftPrivateConversationId(actId);
      if (actId && !isDraft) {
        if (wasReconnected && activeMessages.length > 0) {
          void store.catchUpMessagesAfter(actId);
        } else if (wasReconnected || activeMessages.length === 0) {
          void store.loadMessages(actId, false, { force: wasReconnected });
        }
      }
      if (wasReconnected) {
        const prioritized = (store.conversations || [])
          .filter((c) => !isDraftPrivateConversationId(c.id))
          .filter((c) => c.unread_count > 0 || c.id === actId)
          .slice(0, 8);
        for (const c of prioritized) {
          void store.catchUpMessagesAfter(c.id);
        }
      }
      emitMessengerMetric('ws_connect_open', 1, { reconnected: wasReconnected, openedAt });
    });

    return () => {
      if (flushTimer != null) {
        clearTimeout(flushTimer);
        flush();
      }
      unsubMsg();
      unsubOpen();
    };
  }, [token]);

  return { sendTypingStart, sendTypingStop };
}
