import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../auth/authStore';
import { resolveRealtimeWebSocketUrl } from '../../lib/config';
import { useChatStore } from './chatStore';

/**
 * Hook that connects to the WS server and routes messenger events
 * into the Zustand chatStore. Also handles reconnection.
 */
export function useMessengerWs(): {
  sendTypingStart: (conversationId: string) => void;
  sendTypingStop: (conversationId: string) => void;
} {
  const token = useAuthStore((s) => s.token);
  const wsRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);

  // Typing debounce
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTypingStart = useCallback((conversationId: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'typing:start', conversationId }));
    }
    // Auto-stop after 3s
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      const ws2 = wsRef.current;
      if (ws2?.readyState === WebSocket.OPEN) {
        ws2.send(JSON.stringify({ type: 'typing:stop', conversationId }));
      }
    }, 3000);
  }, []);

  const sendTypingStop = useCallback((conversationId: string) => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'typing:stop', conversationId }));
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const url = resolveRealtimeWebSocketUrl();
    if (!url) return;

    stoppedRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let pingInterval: ReturnType<typeof setInterval> | undefined;

    const clearTimers = () => {
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (pingInterval !== undefined) {
        clearInterval(pingInterval);
        pingInterval = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (stoppedRef.current) return;
      clearTimers();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Wait for the browser online event to reconnect immediately.
        return;
      }
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (stoppedRef.current) return;
      clearTimers();

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        const wasReconnected = attempt > 0;
        attempt = 0;
        ws.send(JSON.stringify({ type: 'auth', token }));

        const store = useChatStore.getState();
        const activeConversationId = store.activeConversationId;
        const activeMessages = activeConversationId
          ? (store.messagesByConv[activeConversationId] || [])
          : [];

        // Resync after reconnect, and also after first open when app started offline/degraded.
        const shouldResyncConversations =
          wasReconnected || store.degradedMode || !store.conversationsLoaded;
        const shouldResyncActiveMessages =
          Boolean(activeConversationId) &&
          (wasReconnected || store.degradedMode || activeMessages.length === 0);

        if (shouldResyncConversations) {
          void store.loadConversations();
        }
        if (activeConversationId && shouldResyncActiveMessages) {
          void store.loadMessages(activeConversationId);
        }

        // Keep-alive ping every 25s
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          handleWsMessage(msg);
        } catch {
          /* malformed message */
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        clearTimers();
        if (!stoppedRef.current) scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    const handleOnline = () => {
      if (stoppedRef.current) return;
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      clearTimers();
      connect();
    };

    const handleOffline = () => {
      const ws = wsRef.current;
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connect();

    return () => {
      stoppedRef.current = true;
      clearTimers();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]);

  return { sendTypingStart, sendTypingStop };
}

function handleWsMessage(msg: any): void {
  const store = useChatStore.getState();

  switch (msg.type) {
    case 'ready':
      if (typeof msg.memberId === 'number') {
        store.setCurrentMemberId(msg.memberId);
      }
      if (Array.isArray(msg.onlineMembers)) {
        store.setOnlineMembers(msg.onlineMembers);
      }
      // Conversation list bootstrap is handled by MessengerPage.
      break;

    case 'msg:new':
      store.handleNewMessage(msg.conversationId, msg.message);
      break;

    case 'msg:edited':
      store.handleMessageEdited(msg.conversationId, msg.messageId, msg.content, msg.updatedAt);
      break;

    case 'msg:deleted':
      store.handleMessageDeleted(msg.conversationId, msg.messageId);
      break;

    case 'msg:reaction':
      store.handleReaction(msg.conversationId, msg.messageId, msg.emoji, msg.memberId, msg.action);
      break;

    case 'msg:poll':
      if (Array.isArray(msg.tallies)) {
        store.handlePollTallies(msg.conversationId, msg.messageId, msg.tallies);
      }
      break;

    case 'typing:start':
      store.handleTypingStart(msg.conversationId, msg.memberId, msg.memberName);
      break;

    case 'typing:stop':
      store.handleTypingStop(msg.conversationId, msg.memberId);
      break;

    case 'conv:created':
      store.handleConvCreated(msg.conversation);
      break;

    case 'conv:updated':
      // Reload conversation list to get updated info
      void store.loadConversations();
      if (typeof msg.conversationId === 'string' && msg.conversationId) {
        store.bumpPinnedRevision(msg.conversationId);
      }
      break;

    case 'conv:history_cleared':
      if (typeof msg.conversationId === 'string' && msg.conversationId) {
        store.handleConvHistoryCleared(msg.conversationId);
        void store.loadConversations();
      }
      break;

    case 'read:updated':
      store.handleReadUpdated(msg.conversationId, msg.memberId, msg.lastReadMessageId);
      break;

    case 'messages_read':
      store.handleReadUpdated(msg.chatId, msg.userId, msg.lastReadMessageId);
      break;

    case 'presence:online':
      store.handlePresenceOnline(msg.memberId);
      break;

    case 'presence:offline':
      store.handlePresenceOffline(msg.memberId);
      break;

    case 'invalidate':
      // Legacy: handled by useRealtimeQuerySync
      break;
  }
}
