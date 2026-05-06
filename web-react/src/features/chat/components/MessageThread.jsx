import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuArrowDown, LuArrowLeft } from 'react-icons/lu';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore as useMessengerChatStore } from '../../messenger/chatStore';
import { useScrollToBottom } from '../hooks/useScrollToBottom';
import { useChatUiStore } from '../store/chatStore';
import { DateSeparator } from './DateSeparator';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

/**
 * @param {{
 *   conversationId: string,
 *   onBack: () => void,
 *   sendMessage: (chatId: string, text: string, type?: string) => void,
 *   sendTyping: (chatId: string, phase: 'start' | 'stop') => void,
 * }} props
 */
export function MessageThread({ conversationId, onBack, sendMessage, sendTyping }) {
  const messages = useChatUiStore(useShallow((s) => s.messages[conversationId] ?? []));
  const activeChat = useChatUiStore((s) => s.activeChat);
  const typing = useChatUiStore((s) => Boolean(s.typingUsers[conversationId]));
  const setReplyTo = useChatUiStore((s) => s.setReplyTo);

  const [menu, setMenu] = useState(
    /** @type {{ x: number, y: number, message: import('../store/chatStore').ChatMessage } | null} */ (
      null
    ),
  );

  const scrollSignal = messages.length + (typing ? 1 : 0);
  const { scrollRef, showScrollDown, onFabClick } = useScrollToBottom(scrollSignal);

  useEffect(() => {
    void useMessengerChatStore.getState().loadMessages(conversationId, false, { force: false });
    void useMessengerChatStore.getState().markAsRead(conversationId);
    useChatUiStore.getState().markRead(conversationId);
  }, [conversationId]);

  const rows = useMemo(() => {
    /** @type {Array<{ kind: 'sep', date: Date } | { kind: 'msg', message: import('../store/chatStore').ChatMessage }>} */
    const out = [];
    let lastDayKey = '';
    for (const m of messages) {
      const d = new Date(m.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (key !== lastDayKey) {
        lastDayKey = key;
        out.push({ kind: 'sep', date: d });
      }
      out.push({ kind: 'msg', message: m });
    }
    return out;
  }, [messages]);

  const openMenu = useCallback((msg, x, y) => {
    setMenu({ x, y, message: msg });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const onReply = useCallback(
    (msg) => {
      setReplyTo(msg);
      closeMenu();
    },
    [setReplyTo, closeMenu],
  );

  const onCopy = useCallback(
    async (msg) => {
      try {
        await navigator.clipboard.writeText(msg.text || '');
      } catch {
        /* ignore */
      }
      closeMenu();
    },
    [closeMenu],
  );

  const onDelete = useCallback(
    async (msg) => {
      closeMenu();
      try {
        await useMessengerChatStore.getState().deleteMessage(msg.id);
      } catch {
        /* ignore */
      }
    },
    [closeMenu],
  );

  const title = activeChat?.name ?? 'Чат';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 md:hidden"
          aria-label="Назад"
        >
          <LuArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {activeChat?.isOnline ? (
            <p className="text-xs text-[#00BF6D]">в сети</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">не в сети</p>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2">
          {rows.map((row) =>
            row.kind === 'sep' ? (
              <DateSeparator key={`${row.date.toISOString()}-sep`} date={row.date} />
            ) : (
              <div key={row.message.id} className="mb-2">
                <MessageBubble
                  message={row.message}
                  onRequestContext={openMenu}
                  onPointerLongPress={(m) =>
                    openMenu(m, Math.min(window.innerWidth - 80, 16), Math.min(window.innerHeight - 120, 120))
                  }
                />
              </div>
            ),
          )}
          {typing ? (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-white px-2 shadow-sm dark:bg-gray-800">
                <TypingIndicator />
              </div>
            </div>
          ) : null}
        </div>

        {showScrollDown ? (
          <button
            type="button"
            onClick={onFabClick}
            className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700"
            aria-label="Вниз"
          >
            <LuArrowDown size={18} />
          </button>
        ) : null}
      </div>

      <ChatInput chatId={conversationId} sendMessage={sendMessage} sendTyping={sendTyping} />

      {menu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/20"
            aria-label="Закрыть меню"
            onClick={closeMenu}
          />
          <div
            className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => onReply(menu.message)}
            >
              Ответить
            </button>
            <button
              type="button"
              className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => onCopy(menu.message)}
            >
              Копировать
            </button>
            {menu.message.isSender ? (
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => onDelete(menu.message)}
              >
                Удалить
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
