import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../auth/authStore';
import { sendRealtimeJson, subscribeRealtimeMessages, subscribeRealtimeOpen } from '../../lib/realtimeWsClient';
import { useChatStore, isDraftPrivateConversationId } from './chatStore';

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
    if (!token) return;

    const unsubMsg = subscribeRealtimeMessages((msg) => handleWsMessage(msg));
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
      unsubMsg();
      unsubOpen();
    };
  }, [token]);

  return { sendTypingStart, sendTypingStop };
}

function handleWsMessage(msg: any): void {
  const store = useChatStore.getState();
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
  const debugWs = (event: string, data: Record<string, unknown>): void => {
    if (!isDev) return;
    // Dev-only trace for read/delivery diagnostics (excluded from production behavior).
    // eslint-disable-next-line no-console
    console.debug(`[messenger:ws] ${event}`, data);
  };
  const pickString = (...values: unknown[]): string => {
    for (const value of values) {
      const normalized = String(value ?? '').trim();
      if (normalized) return normalized;
    }
    return '';
  };
  const pickNumber = (...values: unknown[]): number | null => {
    for (const value of values) {
      const parsed =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  };

  switch (msg.type) {
    case 'ready':
      if (typeof msg.memberId === 'number') {
        store.setCurrentMemberId(msg.memberId);
      }
      if (Array.isArray(msg.onlineMembers)) {
        store.setOnlineMembers(msg.onlineMembers);
      }
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
        void store.loadMessages(convId, false, { force: true });
        void store.loadConversations({ force: true });
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

    case 'msg:server_ack': {
      const convId =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const clientMsgId =
        msg.clientMsgId != null && String(msg.clientMsgId).trim() !== ''
          ? String(msg.clientMsgId).trim()
          : '';
      if (convId && clientMsgId) {
        store.handleMsgServerAck(convId, clientMsgId);
      }
      break;
    }

    case 'msg:delivered': {
      const convId =
        pickString(msg.conversationId, msg.conversation_id, msg.chatId, msg.chat_id) || null;
      const clientMsgId = pickString(msg.clientMsgId, msg.client_msg_id);
      const messageId = pickString(msg.messageId, msg.message_id);
      debugWs('msg:delivered', {
        raw: msg,
        conversationId: convId,
        clientMsgId,
        messageId,
      });
      if (convId && (clientMsgId || messageId)) {
        store.handleMsgDelivered(convId, { clientMsgId, messageId });
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

    case 'msg:payload_updated': {
      const cid =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const mid =
        msg.messageId != null && String(msg.messageId).trim() !== '' ? String(msg.messageId) : null;
      const pl = msg.payload;
      if (
        cid &&
        mid &&
        pl &&
        typeof pl === 'object' &&
        !Array.isArray(pl) &&
        typeof msg.updatedAt === 'string'
      ) {
        store.handleMessagePayloadUpdated(cid, mid, pl as Record<string, unknown>, msg.updatedAt);
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

    case 'conv:updated': {
      const cid =
        typeof msg.conversationId === 'string' && msg.conversationId
          ? String(msg.conversationId)
          : null;

      if (cid) {
        store.bumpPinnedRevision(cid);

        if (msg.conversation && typeof msg.conversation === 'object') {
          store.handleConvUpdated(cid, msg.conversation);
        } else if (
          typeof (msg as { title?: unknown }).title !== 'undefined' ||
          typeof (msg as { avatarUrl?: unknown }).avatarUrl !== 'undefined' ||
          typeof (msg as { avatar_url?: unknown }).avatar_url !== 'undefined'
        ) {
          const m = msg as {
            title?: string | null;
            avatarUrl?: string | null;
            avatar_url?: string | null;
            updated_at?: string;
          };
          const patch: Record<string, unknown> = {};
          if (typeof m.title !== 'undefined') patch.title = m.title;
          if (typeof m.avatarUrl !== 'undefined' || typeof m.avatar_url !== 'undefined') {
            patch.avatar_url = m.avatar_url !== undefined ? m.avatar_url : m.avatarUrl;
          }
          if (typeof m.updated_at === 'string') patch.updated_at = m.updated_at;
          store.handleConvUpdated(cid, patch);
        } else {
          void store.loadConversations();
        }
      } else {
        void store.loadConversations();
      }
      break;
    }

    case 'conv:history_cleared':
      if (typeof msg.conversationId === 'string' && msg.conversationId) {
        store.handleConvHistoryCleared(msg.conversationId);
        void store.loadConversations();
      }
      break;

    case 'read:updated': {
      const conversationId = pickString(
        msg.conversationId,
        msg.conversation_id,
        msg.chatId,
        msg.chat_id,
      );
      const memberId = pickNumber(msg.memberId, msg.member_id, msg.userId, msg.user_id);
      const lastReadMessageId = pickString(
        msg.lastReadMessageId,
        msg.last_read_message_id,
        msg.messageId,
        msg.message_id,
      );
      debugWs('read:updated', {
        raw: msg,
        conversationId,
        memberId,
        lastReadMessageId,
      });
      if (conversationId && memberId != null && lastReadMessageId) {
        store.handleReadUpdated(conversationId, memberId, lastReadMessageId);
      }
      break;
    }

    case 'messages_read': {
      const conversationId = pickString(
        msg.chatId,
        msg.chat_id,
        msg.conversationId,
        msg.conversation_id,
      );
      const memberId = pickNumber(msg.userId, msg.user_id, msg.memberId, msg.member_id);
      const lastReadMessageId = pickString(
        msg.lastReadMessageId,
        msg.last_read_message_id,
        msg.messageId,
        msg.message_id,
      );
      debugWs('messages_read', {
        raw: msg,
        conversationId,
        memberId,
        lastReadMessageId,
      });
      if (conversationId && memberId != null && lastReadMessageId) {
        store.handleReadUpdated(conversationId, memberId, lastReadMessageId);
      }
      break;
    }

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
      break;

    case 'pong':
      break;

    default:
      break;
  }
}
