import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../chatStore';

interface ChatInputProps {
  conversationId: string;
  sendTypingStart: (convId: string) => void;
  sendTypingStop: (convId: string) => void;
  canSend?: boolean;
}

export function ChatInput({
  conversationId,
  sendTypingStart,
  sendTypingStop,
  canSend = true,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const replyTo = useChatStore((s) => s.replyToMessage);
  const editing = useChatStore((s) => s.editingMessage);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditing = useChatStore((s) => s.setEditing);

  // Populate text when editing
  useEffect(() => {
    if (editing) {
      setText(editing.content);
      textareaRef.current?.focus();
    }
  }, [editing]);

  // Focus on reply
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    sendTypingStart(conversationId);
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    sendTypingStop(conversationId);

    if (editing) {
      await editMessage(editing.id, trimmed);
    } else {
      await sendMessage(conversationId, trimmed, replyTo?.id);
    }

    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, conversationId, editing, replyTo, sendMessage, editMessage, sendTypingStop]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter without Shift = send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    // Escape = cancel reply/edit
    if (e.key === 'Escape') {
      if (editing) setEditing(null);
      if (replyTo) setReplyTo(null);
      setText('');
    }
  };

  if (!canSend) {
    return (
      <div className="chatinput-readonly">
        <span>Только администраторы могут публиковать</span>
        <style>{inputStyles}</style>
      </div>
    );
  }

  return (
    <div className="chatinput-wrap">
      {/* Reply/Edit banner */}
      {(replyTo || editing) && (
        <div className="chatinput-banner">
          <div className="chatinput-banner__content">
            <span className="chatinput-banner__label">
              {editing ? '✏️ Редактирование' : `↩️ Ответ для ${replyTo?.sender_name || 'сообщение'}`}
            </span>
            <span className="chatinput-banner__text">
              {editing ? editing.content : replyTo?.content}
            </span>
          </div>
          <button
            type="button"
            className="chatinput-banner__close"
            onClick={() => { setReplyTo(null); setEditing(null); setText(''); }}
            aria-label="Отменить"
          >
            ✕
          </button>
        </div>
      )}

      <div className="chatinput-row">
        <textarea
          ref={textareaRef}
          className="chatinput-textarea"
          placeholder="Сообщение..."
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={4000}
        />
        <button
          type="button"
          className={`chatinput-send ${text.trim() ? 'chatinput-send--active' : ''}`}
          onClick={() => void handleSend()}
          disabled={!text.trim()}
          aria-label="Отправить"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <style>{inputStyles}</style>
    </div>
  );
}

const inputStyles = `
  .chatinput-wrap {
    border-top: 1px solid rgba(28, 25, 23, 0.08);
    background: var(--surface-elevated);
  }

  .chatinput-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(125, 54, 64, 0.05);
    border-bottom: 1px solid rgba(125, 54, 64, 0.1);
  }
  .chatinput-banner__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .chatinput-banner__label {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--primary);
  }
  .chatinput-banner__text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chatinput-banner__close {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .chatinput-banner__close:hover {
    background: rgba(28, 25, 23, 0.06);
    color: var(--text);
  }

  .chatinput-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 12px 10px;
  }

  .chatinput-textarea {
    flex: 1;
    min-height: 40px;
    max-height: 160px;
    padding: 10px 14px;
    border: 1px solid rgba(28, 25, 23, 0.1);
    border-radius: 20px;
    background: var(--surface);
    color: var(--text);
    font-family: inherit;
    font-size: 0.9375rem;
    line-height: 1.4;
    resize: none;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .chatinput-textarea:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(125, 54, 64, 0.1);
  }
  .chatinput-textarea::placeholder {
    color: var(--text-muted);
  }

  .chatinput-send {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    border: none;
    border-radius: 50%;
    background: var(--text-muted);
    color: white;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0.4;
  }
  .chatinput-send--active {
    background: var(--primary);
    opacity: 1;
    box-shadow: 0 2px 8px rgba(125, 54, 64, 0.3);
  }
  .chatinput-send--active:hover {
    background: var(--primary-dark);
    transform: scale(1.05);
  }
  .chatinput-send--active:active {
    transform: scale(0.95);
  }

  .chatinput-readonly {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px 16px;
    font-size: 0.875rem;
    color: var(--text-muted);
    border-top: 1px solid rgba(28, 25, 23, 0.08);
    background: var(--surface-elevated);
  }
`;
