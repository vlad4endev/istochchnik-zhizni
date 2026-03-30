import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '../api/messengerApi';
import type { SearchMember, ConversationType } from '../api/messengerApi';
import { LuX, LuSearch, LuUser, LuUsers, LuMegaphone, LuCheck } from 'react-icons/lu';

interface NewChatDialogProps {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function NewChatDialog({ onClose, onCreated }: NewChatDialogProps) {
  const [mode, setMode] = useState<'personal' | 'group' | 'channel'>('personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SearchMember[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Initial load & Debounced search
  const performSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const results = await api.searchMembers(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    // Show registered users on empty search or initial load
    if (!searchQuery.trim()) {
      performSearch('');
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      performSearch(searchQuery.trim());
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, performSearch]);

  const handleSelectMember = useCallback(
    async (member: SearchMember) => {
      if (mode === 'personal') {
        setCreating(true);
        try {
          const result = await api.createPersonalChat(member.id);
          onCreated(result.conversationId);
        } catch (e) {
          console.error('Failed to create personal chat:', e);
        } finally {
          setCreating(false);
        }
      } else {
        if (!selectedMembers.some((m) => m.id === member.id)) {
          setSelectedMembers((prev) => [...prev, member]);
        }
        setSearchQuery('');
      }
    },
    [mode, selectedMembers, onCreated],
  );

  const handleRemoveSelected = (id: number) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim()) return;
    setCreating(true);
    try {
      const result = await api.createGroupChat(
        groupTitle.trim(),
        mode as ConversationType,
        selectedMembers.map((m) => m.id),
      );
      onCreated(result.conversationId);
    } catch (e) {
      console.error('Failed to create group:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="newchat-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="newchat-dialog">
        <header className="newchat-header">
          <h2 className="newchat-title">
            {mode === 'personal' ? 'Новое сообщение' : mode === 'group' ? 'Новая группа' : 'Новый канал'}
          </h2>
          <button type="button" className="newchat-close" onClick={onClose}><LuX /></button>
        </header>

        {/* Mode tabs */}
        <div className="newchat-tabs">
          {(['personal', 'group', 'channel'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`newchat-tab ${mode === m ? 'newchat-tab--active' : ''}`}
              onClick={() => { setMode(m); setSelectedMembers([]); setGroupTitle(''); setSearchQuery(''); }}
            >
              {m === 'personal' ? <LuUser size={16} /> : m === 'group' ? <LuUsers size={16} /> : <LuMegaphone size={16} />}
              <span>{m === 'personal' ? 'Личный' : m === 'group' ? 'Группа' : 'Канал'}</span>
            </button>
          ))}
        </div>

        {/* Group/channel title */}
        {mode !== 'personal' && (
          <div className="newchat-field">
            <input
              type="text"
              className="newchat-input"
              placeholder={mode === 'channel' ? 'Название канала' : 'Название группы'}
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
        )}

        {/* Selected members chips */}
        {mode !== 'personal' && selectedMembers.length > 0 && (
          <div className="newchat-selected">
            {selectedMembers.map((m) => (
              <span key={m.id} className="newchat-chip">
                <span>{(m.first_name || m.name).split(' ')[0]}</span>
                <button type="button" onClick={() => handleRemoveSelected(m.id)}><LuX size={12} /></button>
              </span>
            ))}
          </div>
        )}

        {/* Search Field */}
        <div className="newchat-search-wrap">
          <LuSearch className="newchat-search-icon" />
          <input
            type="text"
            className="newchat-input-search"
            placeholder={mode === 'personal' ? 'Кому отправить?' : 'Добавить участников…'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus={mode === 'personal'}
          />
        </div>

        {/* Results List */}
        <div className="newchat-results">
          {searching && (
            <div className="newchat-status">Ищем участников…</div>
          )}
          {!searching && searchResults.length === 0 && searchQuery.trim() && (
            <div className="newchat-status">Никого не найдено</div>
          )}
          {!searching && searchResults.length === 0 && !searchQuery.trim() && (
            <div className="newchat-status">Нет доступных участников</div>
          )}
          
          {searchResults.map((member) => {
            const displayName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.name;
            const isSelected = selectedMembers.some((m) => m.id === member.id);
            return (
              <button
                key={member.id}
                type="button"
                className={`newchat-member ${isSelected ? 'newchat-member--selected' : ''}`}
                onClick={() => handleSelectMember(member)}
                disabled={creating || (mode !== 'personal' && isSelected)}
              >
                <div className="newchat-member__avatar" style={{ background: `hsl(${(member.id * 137) % 360}, 60%, 50%)` }}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="newchat-member__name">{displayName}</div>
                {isSelected && <LuCheck className="newchat-member__check" />}
              </button>
            );
          })}
        </div>

        {/* Footer for groups/channels */}
        {mode !== 'personal' && (
          <div className="newchat-footer">
            <button
              type="button"
              className="newchat-create"
              disabled={creating || !groupTitle.trim()}
              onClick={() => void handleCreateGroup()}
            >
              {creating ? 'Создаётся…' : `Создать ${mode === 'channel' ? 'канал' : 'группу'}`}
            </button>
          </div>
        )}
      </div>

      <style>{tgDialogStyles}</style>
    </div>
  );
}

const tgDialogStyles = `
  .newchat-overlay {
    position: fixed;
    inset: 0;
    backdrop-filter: blur(8px);
    background: rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }

  .newchat-dialog {
    background: var(--surface-elevated);
    width: 100%;
    max-width: 440px;
    border-radius: 24px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .newchat-header {
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0,0,0,0.05);
  }

  .newchat-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .newchat-close {
    background: rgba(0,0,0,0.05);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .newchat-tabs {
    display: flex;
    padding: 12px;
    gap: 8px;
    background: rgba(0,0,0,0.02);
  }

  .newchat-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    border: none;
    background: transparent;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-secondary);
    transition: all 0.2s;
  }

  .newchat-tab--active {
    background: var(--primary);
    color: white;
  }

  .newchat-field {
    padding: 16px 20px 8px;
  }

  .newchat-input {
    width: 100%;
    background: rgba(0,0,0,0.03);
    border: 1px solid transparent;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 1rem;
    outline: none;
    transition: all 0.2s;
  }

  .newchat-input:focus {
    border-color: var(--primary);
    background: white;
    box-shadow: 0 0 0 4px rgba(125, 54, 64, 0.1);
  }

  .newchat-search-wrap {
    position: relative;
    padding: 8px 20px;
  }

  .newchat-search-icon {
    position: absolute;
    left: 36px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
  }

  .newchat-input-search {
    width: 100%;
    background: rgba(0,0,0,0.03);
    border: none;
    padding: 10px 16px 10px 44px;
    border-radius: 20px;
    font-size: 0.95rem;
    outline: none;
  }

  .newchat-selected {
    padding: 4px 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .newchat-chip {
    background: rgba(125, 54, 64, 0.08);
    color: var(--primary);
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .newchat-chip button {
    background: transparent;
    border: none;
    color: var(--primary);
    display: flex;
    cursor: pointer;
  }

  .newchat-results {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    min-height: 200px;
  }

  .newchat-status {
    text-align: center;
    padding: 40px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .newchat-member {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 24px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background 0.2s;
  }

  .newchat-member:hover:not(:disabled) {
    background: rgba(0,0,0,0.03);
  }

  .newchat-member__avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
  }

  .newchat-member__name {
    flex: 1;
    text-align: left;
    font-weight: 700;
    font-size: 0.95rem;
  }

  .newchat-member__check {
    color: var(--primary);
  }

  .newchat-footer {
    padding: 16px 24px 24px;
    border-top: 1px solid rgba(0,0,0,0.05);
  }

  .newchat-create {
    width: 100%;
    padding: 14px;
    border-radius: 16px;
    border: none;
    background: var(--primary);
    color: white;
    font-weight: 800;
    font-size: 1rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(125, 54, 64, 0.2);
  }

  .newchat-create:disabled {
    background: var(--text-muted);
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
