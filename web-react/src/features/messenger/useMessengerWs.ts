import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../auth/authStore';
import { resolveRealtimeWebSocketUrl } from '../../lib/config';
import { useChatStore, isDraftPrivateConversationId } from './chatStore';

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
    let pongDeadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const clearPongDeadline = () => {
      if (pongDeadlineTimer !== undefined) {
        clearTimeout(pongDeadlineTimer);
        pongDeadlineTimer = undefined;
      }
    };

    const clearTimers = () => {
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (pingInterval !== undefined) {
        clearInterval(pingInterval);
        pingInterval = undefined;
      }
      clearPongDeadline();
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
        const shouldResyncConversations = wasReconnected || !store.conversationsLoaded;

        if (shouldResyncConversations) {
          void store.loadConversations();
        }

        const actId = activeConversationId;
        const isDraft = actId != null && isDraftPrivateConversationId(actId);
        if (actId && !isDraft) {
          if (wasReconnected && activeMessages.length > 0) {
            void store.catchUpMessagesAfter(actId);
          } else if (wasReconnected || activeMessages.length === 0) {
            void store.loadMessages(actId);
          }
        }

        // Heartbeat: ping every 15s; if no pong within 10s, close to force reconnect.
        pingInterval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          clearPongDeadline();
          ws.send(JSON.stringify({ type: 'ping' }));
          pongDeadlineTimer = setTimeout(() => {
            pongDeadlineTimer = undefined;
            if (ws.readyState === WebSocket.OPEN && wsRef.current === ws) {
              try {
                ws.close(4000, 'heartbeat');
              } catch {
                /* ignore */
              }
            }
          }, 10_000);
        }, 15_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg && msg.type === 'pong') {
            clearPongDeadline();
            return;
          }
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

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (stoppedRef.current) return;
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();

    return () => {
      stoppedRef.current = true;
      clearTimers();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

    case 'msg:new': {
      const convId =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const payload = msg.message;
      if (convId && payload && typeof payload === 'object' && payload.id != null) {
        store.handleNewMessage(convId, payload);
      } else if (convId) {
        void store.loadMessages(convId);
        void store.loadConversations();
      }
      break;
    }

    case 'msg:send_failed': {
      const convId =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const clientMsgId =
        msg.clientMsgId != null && String(msg.clientMsgId).trim() !== ''
          ? String(msg.clientMsgId).trim()
          : '';
      if (convId && clientMsgId) {
        store.handleMessageSendFailed(convId, clientMsgId);
      }
      break;
    }

    case 'msg:edited': {
      const cid =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const mid =
        msg.messageId != null && String(msg.messageId).trim() !== '' ? String(msg.messageId) : null;
      if (
        cid &&
        mid &&
        typeof msg.content === 'string' &&
        typeof msg.updatedAt === 'string'
      ) {
        store.handleMessageEdited(cid, mid, msg.content, msg.updatedAt);
      }
      break;
    }

    case 'msg:deleted': {
      const cid =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const mid =
        msg.messageId != null && String(msg.messageId).trim() !== '' ? String(msg.messageId) : null;
      if (cid && mid) {
        store.handleMessageDeleted(cid, mid);
      }
      break;
    }

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
      store.handlePresenceOffline(
        msg.memberId,
        typeof msg.lastSeenAt === 'string' ? msg.lastSeenAt : undefined,
      );
      break;

    case 'invalidate':
      // Legacy: handled by useRealtimeQuerySync
      break;
  }
}
