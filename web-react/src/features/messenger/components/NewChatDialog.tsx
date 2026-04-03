import * as api from '../api/messengerApi';
import type { SearchMember } from '../api/messengerApi';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { LuSearch, LuX, LuUsers, LuMegaphone } from 'react-icons/lu';
import { useChatStore, DRAFT_PRIVATE_PREFIX } from '../chatStore';

interface NewChatDialogProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const DIALOG_STYLES = `
  .tg-dialog-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4); z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(2px);
  }
  .tg-dialog {
    width: 90%; max-width: 440px; background: var(--tg-surface);
    border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    display: flex; flex-direction: column; max-height: 80vh;
    overflow: hidden; animation: tgPop 0.2s ease-out;
  }
  @keyframes tgPop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .tg-dialog-header {
    padding: 16px; border-bottom: 1px solid var(--tg-border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .tg-dialog-title { font-size: 1.125rem; font-weight: 700; color: var(--tg-text); }
  .tg-dialog-search { padding: 12px 16px; background: var(--tg-surface-elevated); border-bottom: 1px solid var(--tg-border); display: flex; align-items: center; gap: 8px; }
  .tg-dialog-input { flex: 1; background: transparent; border: none; outline: none; font-size: 0.9375rem; color: var(--tg-text); }
  .tg-dialog-results { flex: 1; overflow-y: auto; padding: 8px 0; }
  .tg-member-item {
    width: 100%; padding: 10px 16px; display: flex; align-items: center; gap: 12px;
    transition: background 0.15s; border: none; background: transparent; text-align: left;
    cursor: pointer;
  }
  .tg-member-item:hover { background: rgba(0,0,0,0.03); }
  .tg-member-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--tg-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.875rem; }
  .tg-member-info { flex: 1; min-width: 0; }
  .tg-member-name { font-weight: 600; font-size: 0.9375rem; color: var(--tg-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tg-member-status { font-size: 0.8125rem; color: var(--tg-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tg-dialog-sections { padding: 8px; display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--tg-border); }
  .tg-section-btn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: none; background: transparent; border-radius: 8px; cursor: pointer; transition: background 0.15s; color: var(--tg-primary); font-weight: 600; }
  .tg-section-btn:hover { background: var(--tg-primary-light); }
  .tg-section-icon { width: 40px; height: 40px; border-radius: 50%; background: var(--tg-primary-light); display: flex; align-items: center; justify-content: center; }
`;

export function NewChatDialog({ onClose, onCreated }: NewChatDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<'contact' | 'group' | 'channel'>('contact');
  const [title, setTitle] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversations = useChatStore((s) => s.conversations);
  const openPrivateDraft = useChatStore((s) => s.openPrivateDraft);

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
    if (!searchQuery.trim()) {
      void performSearch('');
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void performSearch(searchQuery.trim());
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, performSearch]);

  const sortedContacts = useMemo(() => {
    const byMemberId = new Map<number, { convId: string; updatedAt: string }>();
    for (const c of conversations) {
      if (c.type !== 'private' || !c.other_member) continue;
      byMemberId.set(c.other_member.id, { convId: c.id, updatedAt: c.updated_at });
    }
    const norm = (s: string) => s.trim().toLowerCase();
    const displayName = (m: SearchMember) =>
      norm(m.first_name ? `${m.first_name} ${m.last_name || ''}` : m.name);

    return [...searchResults].sort((a, b) => {
      const aConv = byMemberId.get(a.id);
      const bConv = byMemberId.get(b.id);
      if (aConv && !bConv) return -1;
      if (!aConv && bConv) return 1;
      if (aConv && bConv) {
        // newer first
        const at = Date.parse(aConv.updatedAt);
        const bt = Date.parse(bConv.updatedAt);
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
      }
      return displayName(a).localeCompare(displayName(b), 'ru');
    });
  }, [conversations, searchResults]);

  const handleOpenChat = (member: SearchMember) => {
    // Не создаём чат в списке до первого сообщения — открываем "черновик" private-чата.
    openPrivateDraft(member);
    onCreated(`${DRAFT_PRIVATE_PREFIX}${member.id}`);
  };

  const handleCreateGroup = async () => {
    if (!title.trim()) return;
    try {
      const type = mode === 'group' ? 'group' : 'channel';
      const result = await api.createGroupChat(title.trim(), type, []);
      onCreated(result.conversationId);
    } catch (e) {
      alert('Ошибка при создании');
    }
  };

  return (
    <div className="tg-dialog-overlay" onClick={onClose}>
      <div className="tg-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tg-dialog-header">
          <h2 className="tg-dialog-title">
            {mode === 'contact' ? 'Новое сообщение' : mode === 'group' ? 'Новая группа' : 'Новый канал'}
          </h2>
          <button className="tg-icon-btn" onClick={onClose}><LuX size={24} /></button>
        </div>

        {mode === 'contact' ? (
          <>
            <div className="tg-dialog-search">
              <LuSearch size={20} className="text-stone-400" />
              <input 
                autoFocus
                className="tg-dialog-input" 
                placeholder="Поиск участников..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="tg-dialog-results">
              {!searchQuery && (
                <div className="tg-dialog-sections">
                  <button className="tg-section-btn" onClick={() => setMode('group')}>
                    <div className="tg-section-icon"><LuUsers size={20} /></div>
                    Создать группу
                  </button>
                  <button className="tg-section-btn" onClick={() => setMode('channel')}>
                    <div className="tg-section-icon"><LuMegaphone size={20} /></div>
                    Создать канал
                  </button>
                </div>
              )}

              {searching ? (
                <div className="tg-empty-state">Поиск...</div>
              ) : sortedContacts.map((u) => (
                <button 
                  key={u.id} 
                  className="tg-member-item"
                  onClick={() => handleOpenChat(u)}
                >
                  <div className="tg-member-avatar" style={{ background: getAvatarColor(String(u.id)) }}>
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      (u.first_name?.[0] || u.name[0])
                    )}
                  </div>
                  <div className="tg-member-info">
                    <div className="tg-member-name">{u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.name}</div>
                    <div className="tg-member-status">Откроется как черновик · появится в списке после 1 сообщения</div>
                  </div>
                </button>
              ))}

              {!searching && searchQuery && searchResults.length === 0 && (
                <div className="tg-empty-state">Участники не найдены</div>
              )}
            </div>
          </>
        ) : (
          <div className="tg-dialog-results" style={{ padding: '20px' }}>
            <div className="tg-dialog-search" style={{ border: '1px solid var(--tg-border)', borderRadius: '8px', marginBottom: '20px' }}>
              <input 
                autoFocus
                className="tg-dialog-input" 
                placeholder={mode === 'group' ? "Название группы" : "Название канала"} 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <button 
              className="tg-compose-btn" 
              style={{ width: '100%', padding: '12px', background: 'var(--tg-primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
              onClick={handleCreateGroup}
              disabled={!title.trim()}
            >
              Создать
            </button>
          </div>
        )}
      </div>
      <style>{DIALOG_STYLES}</style>
    </div>
  );
}

function getAvatarColor(id: string): string {
  const AVATAR_COLORS = ['#C0392B', '#E67E22', '#D35400', '#F1C40F', '#27AE60', '#16A085', '#2980B9', '#8E44AD'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) { hash = id.charCodeAt(i) + ((hash << 5) - hash); }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
