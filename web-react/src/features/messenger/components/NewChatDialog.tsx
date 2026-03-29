import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '../api/messengerApi';
import type { SearchMember, ConversationType } from '../api/messengerApi';

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

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await api.searchMembers(searchQuery.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

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
        setSearchResults([]);
      }
    },
    [mode, selectedMembers, onCreated],
  );

  const handleRemoveSelected = (id: number) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim() || selectedMembers.length === 0) return;
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
        <div className="newchat-header">
          <h2 className="newchat-title">Новый чат</h2>
          <button type="button" className="newchat-close" onClick={onClose}>✕</button>
        </div>

        {/* Mode tabs */}
        <div className="newchat-tabs">
          {(['personal', 'group', 'channel'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`newchat-tab ${mode === m ? 'newchat-tab--active' : ''}`}
              onClick={() => { setMode(m); setSelectedMembers([]); setGroupTitle(''); }}
            >
              {m === 'personal' ? '💬 Личный' : m === 'group' ? '👥 Группа' : '📢 Канал'}
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
            />
          </div>
        )}

        {/* Selected members (for group/channel) */}
        {mode !== 'personal' && selectedMembers.length > 0 && (
          <div className="newchat-selected">
            {selectedMembers.map((m) => (
              <span key={m.id} className="newchat-chip">
                {(m.first_name || m.name).split(' ')[0]}
                <button type="button" onClick={() => handleRemoveSelected(m.id)}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="newchat-field">
          <input
            type="text"
            className="newchat-input"
            placeholder="Поиск участников..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="newchat-results">
          {searching && (
            <div className="newchat-searching">Поиск…</div>
          )}
          {!searching && searchResults.length === 0 && searchQuery.trim() && (
            <div className="newchat-no-results">Никого не найдено</div>
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
                disabled={creating || isSelected}
              >
                <div className="newchat-member__avatar" style={{ background: `hsl(${(member.id * 37) % 360}, 60%, 55%)` }}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="newchat-member__name">{displayName}</span>
                {isSelected && <span className="newchat-member__check">✓</span>}
              </button>
            );
          })}
        </div>

        {/* Create group button */}
        {mode !== 'personal' && (
          <div className="newchat-footer">
            <button
              type="button"
              className="newchat-create"
              disabled={creating || !groupTitle.trim() || selectedMembers.length === 0}
              onClick={() => void handleCreateGroup()}
            >
              {creating ? 'Создание…' : `Создать ${mode === 'channel' ? 'канал' : 'группу'}`}
            </button>
          </div>
        )}

        {creating && mode === 'personal' && (
          <div className="newchat-footer">
            <span className="newchat-creating-text">Создание чата…</span>
          </div>
        )}
      </div>

      <style>{dialogStyles}</style>
    </div>
  );
}

const dialogStyles = `
  .newchat-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    animation: overlayFadeIn 0.2s ease;
  }

  @keyframes overlayFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .newchat-dialog {
    width: 90%;
    max-width: 440px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-elevated);
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    animation: dialogSlideUp 0.25s ease;
  }

  @keyframes dialogSlideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .newchat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(28, 25, 23, 0.06);
  }

  .newchat-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  .newchat-close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-size: 1rem;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .newchat-close:hover {
    background: rgba(28, 25, 23, 0.06);
    color: var(--text);
  }

  .newchat-tabs {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
  }
  .newchat-tab {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 10px;
    background: rgba(28, 25, 23, 0.04);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .newchat-tab:hover {
    background: rgba(28, 25, 23, 0.08);
  }
  .newchat-tab--active {
    background: var(--primary) !important;
    color: white !important;
  }

  .newchat-field {
    padding: 0 16px 8px;
  }
  .newchat-input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid rgba(28, 25, 23, 0.1);
    border-radius: 12px;
    background: var(--surface);
    font-size: 0.9375rem;
    color: var(--text);
    outline: none;
    transition: border-color 0.2s;
  }
  .newchat-input:focus {
    border-color: var(--primary);
  }
  .newchat-input::placeholder {
    color: var(--text-muted);
  }

  .newchat-selected {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 16px 8px;
  }
  .newchat-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 16px;
    background: rgba(125, 54, 64, 0.1);
    color: var(--primary);
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .newchat-chip button {
    border: none;
    background: transparent;
    color: var(--primary);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 2px;
  }

  .newchat-results {
    flex: 1;
    overflow-y: auto;
    min-height: 120px;
    max-height: 320px;
  }

  .newchat-searching,
  .newchat-no-results {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .newchat-member {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 20px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s;
  }
  .newchat-member:hover {
    background: rgba(125, 54, 64, 0.04);
  }
  .newchat-member--selected {
    opacity: 0.5;
  }

  .newchat-member__avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .newchat-member__name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }

  .newchat-member__check {
    color: var(--primary);
    font-weight: 700;
    font-size: 1.125rem;
  }

  .newchat-footer {
    padding: 12px 16px;
    border-top: 1px solid rgba(28, 25, 23, 0.06);
  }
  .newchat-create {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 12px;
    background: var(--primary);
    color: white;
    font-size: 0.9375rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }
  .newchat-create:hover:not(:disabled) {
    background: var(--primary-dark);
  }
  .newchat-create:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .newchat-creating-text {
    display: block;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
`;
