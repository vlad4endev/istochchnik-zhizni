import { useCallback, useEffect, useRef, useState } from 'react';
import { LuCamera, LuMic, LuPaperclip, LuSend, LuSmile } from 'react-icons/lu';

import { ReplyPreview } from './ReplyPreview';

/**
 * @param {{
 *   chatId: string,
 *   sendMessage: (chatId: string, text: string, type?: string) => void,
 *   sendTyping: (chatId: string, phase: 'start' | 'stop') => void,
 * }} props
 */
export function ChatInput({ chatId, sendMessage, sendTyping }) {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const typingStopTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const [value, setValue] = useState('');

  const flushTypingStop = useCallback(() => {
    if (typingStopTimerRef.current != null) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    sendTyping(chatId, 'stop');
  }, [chatId, sendTyping]);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current != null) {
        clearTimeout(typingStopTimerRef.current);
      }
    };
  }, []);

  const onChange = (e) => {
    const next = e.target.value;
    setValue(next);

    if (next.length > 0) {
      sendTyping(chatId, 'start');
      if (typingStopTimerRef.current != null) {
        clearTimeout(typingStopTimerRef.current);
      }
      typingStopTimerRef.current = setTimeout(() => {
        typingStopTimerRef.current = null;
        sendTyping(chatId, 'stop');
      }, 1500);
    } else {
      flushTypingStop();
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || !chatId) return;
    flushTypingStop();
    sendMessage(chatId, text, 'text');
    setValue('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="border-t border-gray-100 bg-white px-2 py-2 dark:border-gray-800 dark:bg-gray-950">
      <ReplyPreview />
      <div className="flex items-center gap-1">
        {hasText ? null : (
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Голосовое сообщение"
          >
            <LuMic size={20} />
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Сообщение"
          className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 outline-none ring-[#00BF6D] focus:border-[#00BF6D] focus:ring-1 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Эмодзи"
        >
          <LuSmile size={20} />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Вложение"
        >
          <LuPaperclip size={20} />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Камера"
        >
          <LuCamera size={20} />
        </button>
        {hasText ? (
          <button
            type="button"
            onClick={submit}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00BF6D] text-white shadow-sm hover:opacity-95"
            aria-label="Отправить"
          >
            <LuSend size={18} className="-ml-px" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
