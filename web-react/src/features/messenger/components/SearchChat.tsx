import { useState, useRef, useEffect } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { useChatStore } from '../chatStore';
import { MessageBubble } from './MessageBubble';
import './messenger.css';

interface SearchChatProps {
  conversationId: string;
  onClose: () => void;
}

export function SearchChat({ conversationId, onClose }: SearchChatProps) {
  const [query, setQuery] = useState('');
  const searchMessages = useChatStore((s) => s.searchMessages);
  const clearSearch = useChatStore((s) => s.clearSearch);
  const searchResults = useChatStore((s) => s.searchResults);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 1) {
      clearSearch();
      return;
    }
    await searchMessages(value, conversationId);
  };

  const handleClose = () => {
    clearSearch();
    setQuery('');
    onClose();
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
              placeholder="Поиск сообщений..."
              value={query}
              onChange={(e) => void handleSearch(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="tg-search-clear"
                onClick={() => void handleSearch('')}
                aria-label="Очистить"
              >
                <LuX size={18} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="tg-icon-btn"
            onClick={handleClose}
            aria-label="Закрыть поиск"
          >
            <LuX size={24} />
          </button>
        </div>

        <div className="tg-search-results">
          {searchLoading && <div className="tg-search-loading">Поиск...</div>}
          {!searchLoading && searchQuery && searchResults.length === 0 && (
            <div className="tg-search-empty">Нет результатов для "{searchQuery}"</div>
          )}
          {searchResults.map((msg) => (
            <div key={msg.id} className="tg-search-result-item">
              <MessageBubble message={msg} isGroupedPrev={false} isGroupedNext={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
