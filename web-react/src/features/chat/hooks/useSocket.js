import { useCallback, useEffect } from 'react';

import { isRealtimeWsOpen } from '../../../lib/realtimeWsClient';
import { useAuthStore } from '../../auth/authStore';
import { useChatStore as useMessengerChatStore } from '../../messenger/chatStore';
import { useChatUiStore } from '../store/chatStore';
import { useSocketStore } from '../store/socketStore';

/**
 * Адаптер поверх общего WebSocket: подключение/emit + отправка через существующий messenger store
 * (оптимистичные сообщения приходят в UI через `messengerToChatUiSync`).
 *
 * @returns {{
 *   isConnected: boolean,
 *   sendMessage: (chatId: string, content: string, type?: string) => void,
 *   sendTyping: (chatId: string, phase: 'start' | 'stop') => void,
 * }}
 */
export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const connect = useSocketStore((s) => s.connect);
  const disconnect = useSocketStore((s) => s.disconnect);
  const emit = useSocketStore((s) => s.emit);
  const isConnected = useSocketStore((s) => s.isConnected);

  useEffect(() => {
    if (!token) {
      disconnect();
      return;
    }
    connect(undefined, token);
    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  useEffect(() => {
    const id = window.setInterval(() => {
      useSocketStore.setState({ isConnected: isRealtimeWsOpen() });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const sendMessage = useCallback(
    (chatId, content, type = 'text') => {
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (!chatId || !trimmed) return;

      const replySnap = useChatUiStore.getState().replyTo;
      useChatUiStore.getState().setReplyTo(null);

      emit('message:send', {
        chatId,
        content: trimmed,
        type,
        replyTo: replySnap?.id,
      });

      if (type !== 'text') {
        void useMessengerChatStore.getState().sendMessage(chatId, trimmed, replySnap?.id ?? null);
        return;
      }

      void useMessengerChatStore.getState().sendMessage(chatId, trimmed, replySnap?.id ?? null);
    },
    [emit],
  );

  const sendTyping = useCallback(
    (chatId, phase) => {
      if (!chatId) return;
      if (phase === 'start') {
        emit('typing:start', { conversationId: chatId });
      } else {
        emit('typing:stop', { conversationId: chatId });
      }
    },
    [emit],
  );

  return { isConnected, sendMessage, sendTyping };
}
