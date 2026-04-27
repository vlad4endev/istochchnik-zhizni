import { useState, useRef, useEffect } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { useChatStore } from '../chatStore';
import { MessageBubble } from './MessageBubble';
import './messenger.css';

const SEARCH_DEBOUNCE_MS = 320;

interface SearchChatProps {
  conversationId: string;
  onClose: () => void;
  /** Перейти к сообщению в ленте (виртуализатор + подсветка) и закрыть поиск. */
  onJumpToMessage: (messageId: string) => void;
}

export function SearchChat({ conversationId, onClose, onJumpToMessage }: SearchChatProps) {
  const [query, setQuery] = useState('');
  const searchMessages = useChatStore((s) => s.searchMessages);
  const clearSearch = useChatStore((s) => s.clearSearch);
  const searchResults = useChatStore((s) => s.searchResults);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clearSearch();
    setQuery('');
    queueMicrotask(() => inputRef.current?.focus());
  }, [conversationId, clearSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      clearSearch();
    };
  }, [clearSearch]);

  useEffect(() => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const trimmed = query.trim();
    if (trimmed.length < 1) {
      clearSearch();
      return;
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void searchMessages(trimmed, conversationId);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, conversationId, searchMessages, clearSearch]);

  const handleClose = () => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    clearSearch();
    setQuery('');
    onClose();
  };

  const handlePickResult = (messageId: string | number) => {
    const id = String(messageId ?? '').trim();
    if (!/^\d+$/.test(id)) return;
    onJumpToMessage(id);
    handleClose();
  };

  return (
    <div className="tg-search-overlay">
      <div className="tg-search-panel">
        <div className="tg-search-header">
          <div className="tg-search-input-wrapper">
            <LuSearch size={20} className="tg-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="tg-search-input"
              placeholder="Поиск сообщений…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button
                type="button"
                className="tg-search-clear"
                onClick={() => setQuery('')}
                aria-label="Очистить"
              >
                <LuX size={18} />
              </button>
            ) : null}
          </div>
          <button type="button" className="tg-icon-btn" onClick={handleClose} aria-label="Закрыть поиск">
            <LuX size={24} />
          </button>
        </div>

        <div className="tg-search-results">
          {searchLoading && query.trim().length > 0 ? <div className="tg-search-loading">Поиск…</div> : null}
          {!searchLoading && searchQuery && searchResults.length === 0 ? (
            <div className="tg-search-empty">Нет результатов для «{searchQuery}»</div>
          ) : null}
          {searchResults.map((msg) => (
            <button
              key={msg.id}
              type="button"
              className="tg-search-result-item tg-search-result-item--clickable block w-full cursor-pointer rounded-lg border-0 bg-transparent p-0 text-left transition-colors hover:bg-stone-100/80"
              onClick={() => handlePickResult(msg.id)}
            >
              <MessageBubble message={msg} isGroupedPrev={false} isGroupedNext={false} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
