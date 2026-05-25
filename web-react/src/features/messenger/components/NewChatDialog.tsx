import * as api from '../api/messengerApi';
import type { SearchMember } from '../api/messengerApi';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { LuSearch, LuX, LuUsers, LuMegaphone, LuChevronLeft, LuCamera } from 'react-icons/lu';
import { useChatStore, DRAFT_PRIVATE_PREFIX } from '../chatStore';
import { AppAvatar } from '../../../components/AppAvatar';
import { getAvatarColor } from '../avatarUtils';
import { emitAppToast } from '../../../lib/uiFeedback';
import { compressImageForMessengerUpload } from '../compressImageForUpload';
import { canAddMemberToGroupChat, formatMemberSearchStatusLine } from '../memberPresenceLabel';

interface NewChatDialogProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

type GroupWizardStep = 'members' | 'details';

const DIALOG_STYLES = `
  .tg-dialog-overlay {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.4); z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    box-sizing: border-box;
    padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
    backdrop-filter: blur(2px);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .tg-dialog {
    width: 90%; max-width: 440px; background: var(--tg-surface);
    border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    display: flex; flex-direction: column;
    max-height: min(85dvh, calc(100% - 8px));
    overflow: hidden; animation: tgPop 0.2s ease-out;
    flex-shrink: 0;
  }
  @keyframes tgPop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .tg-dialog-header {
    padding: 12px 12px 12px 8px; border-bottom: 1px solid var(--tg-border);
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    flex-shrink: 0;
  }
  .tg-dialog-header-main {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px;
  }
  .tg-dialog-back {
    flex-shrink: 0; width: 40px; height: 40px; border: none; border-radius: 10px;
    background: transparent; color: var(--tg-primary); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background 0.15s;
  }
  .tg-dialog-back:hover { background: rgba(0,0,0,0.06); }
  .tg-dialog-title { font-size: 1.0625rem; font-weight: 700; color: var(--tg-text); margin: 0; line-height: 1.25; }
  .tg-dialog-search { padding: 12px 16px; background: var(--tg-surface-elevated); border-bottom: 1px solid var(--tg-border); display: flex; align-items: center; gap: 8px; }
  .tg-dialog-input { flex: 1; background: transparent; border: none; outline: none; font-size: 0.9375rem; color: var(--tg-text); }
  .tg-dialog-results { flex: 1; overflow-y: auto; padding: 8px 0; min-height: 0; }
  .tg-member-item {
    width: 100%; padding: 10px 16px; display: flex; align-items: center; gap: 12px;
    transition: background 0.15s; border: none; background: transparent; text-align: left;
    cursor: pointer;
  }
  .tg-member-item:hover { background: rgba(0,0,0,0.03); }
  .tg-member-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--tg-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.875rem; flex-shrink: 0; }
  .tg-member-info { flex: 1; min-width: 0; }
  .tg-member-name { font-weight: 600; font-size: 0.9375rem; color: var(--tg-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tg-member-status { font-size: 0.8125rem; color: var(--tg-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tg-dialog-sections { padding: 8px; display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--tg-border); }
  .tg-section-btn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: none; background: transparent; border-radius: 8px; cursor: pointer; transition: background 0.15s; color: var(--tg-primary); font-weight: 600; }
  .tg-section-btn:hover { background: var(--tg-primary-light); }
  .tg-section-icon { width: 40px; height: 40px; border-radius: 50%; background: var(--tg-primary-light); display: flex; align-items: center; justify-content: center; }
  .tg-group-footer {
    padding: 12px 16px 16px;
    border-top: 1px solid var(--tg-border);
    background: var(--tg-surface);
    flex-shrink: 0;
  }
  .tg-group-hint {
    margin: 0 0 10px;
    font-size: 0.8125rem;
    line-height: 1.35;
    color: var(--tg-text-muted);
  }
  .tg-group-avatar-wrap {
    position: relative;
    width: 96px; height: 96px; border-radius: 50%; margin: 0 auto 10px;
    overflow: hidden;
    border: 2px solid var(--tg-border);
    background: var(--tg-surface-elevated);
    cursor: pointer;
    padding: 0;
    display: flex; align-items: center; justify-content: center;
    transition: box-shadow 0.15s, transform 0.12s;
  }
  .tg-group-avatar-wrap:hover {
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
  }
  .tg-group-avatar-wrap:focus-visible {
    outline: 2px solid var(--tg-primary);
    outline-offset: 2px;
  }
  .tg-group-avatar-overlay {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: flex-end; padding-bottom: 6px;
    background: linear-gradient(transparent 35%, rgba(0,0,0,0.55));
    color: white; font-size: 0.6875rem; font-weight: 700; opacity: 0;
    transition: opacity 0.15s; pointer-events: none;
  }
  .tg-group-avatar-wrap:hover .tg-group-avatar-overlay { opacity: 1; }
  .tg-group-avatar-remove {
    margin: 6px auto 0;
    border: none; background: none; cursor: pointer;
    font-size: 0.8125rem; font-weight: 600; color: var(--tg-primary);
    text-decoration: underline;
    padding: 4px;
  }
  .tg-field-error {
    margin: 6px 0 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #b91c1c;
  }
  @media (min-width: 769px) {
    .tg-dialog-overlay {
      align-items: center;
    }
  }
`;

export function NewChatDialog({ onClose, onCreated }: NewChatDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<'contact' | 'group' | 'channel'>('contact');
  const [groupWizardStep, setGroupWizardStep] = useState<GroupWizardStep>('members');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** Локальное фото до создания чата (после создания загружается в Storage). */
  const [avatarDraft, setAvatarDraft] = useState<{ file: File; url: string } | null>(null);
  /** Участники группы/канала при создании (id → карточка поиска). */
  const [groupPick, setGroupPick] = useState<Record<number, SearchMember>>({});
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const conversations = useChatStore((s) => s.conversations);
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const openPrivateDraft = useChatStore((s) => s.openPrivateDraft);
  const handleConvCreated = useChatStore((s) => s.handleConvCreated);
  const handleConvUpdated = useChatStore((s) => s.handleConvUpdated);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const onlineMembers = useChatStore((s) => s.onlineMembers);

  const memberStatusLine = useCallback(
    (u: SearchMember) => {
      const enriched = { ...u, is_online: onlineMembers.has(u.id) || Boolean(u.is_online) };
      return formatMemberSearchStatusLine(enriched);
    },
    [onlineMembers],
  );

  const clearAvatarDraft = useCallback(() => {
    setAvatarDraft((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (avatarFileInputRef.current) avatarFileInputRef.current.value = '';
  }, []);

  useEffect(() => {
    return () => {
      setAvatarDraft((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, []);

  /** iOS/Android: при открытой клавиатуре фикс. оверлей + «полный» layout viewport оставляют «белую полосу» — совмещаем с visualViewport. */
  const [vvRect, setVvRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      setVvRect({
        top: vv.offsetTop,
        left: vv.offsetLeft,
        width: vv.width,
        height: vv.height,
      });
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    const onWin = () => sync();
    window.addEventListener('orientationchange', onWin);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', onWin);
    };
  }, []);

  const overlayVisualViewportStyle = useMemo((): CSSProperties => {
    if (!vvRect) return {};
    return {
      top: vvRect.top,
      left: vvRect.left,
      width: vvRect.width,
      height: vvRect.height,
      right: 'auto',
      bottom: 'auto',
    };
  }, [vvRect]);

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

  useEffect(() => {
    if (mode === 'group' || mode === 'channel') {
      setGroupWizardStep('members');
      setTitle('');
      setTitleError(null);
      clearAvatarDraft();
    }
  }, [mode, clearAvatarDraft]);

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
        const at = Date.parse(aConv.updatedAt);
        const bt = Date.parse(bConv.updatedAt);
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
      }
      return displayName(a).localeCompare(displayName(b), 'ru');
    });
  }, [conversations, searchResults]);

  const pickedCount = useMemo(() => {
    return Object.keys(groupPick).filter((k) => {
      const id = Number(k);
      return currentMemberId == null || id !== currentMemberId;
    }).length;
  }, [groupPick, currentMemberId]);

  const handleOpenChat = (member: SearchMember) => {
    openPrivateDraft(member);
    onCreated(`${DRAFT_PRIVATE_PREFIX}${member.id}`);
  };

  const toggleGroupMember = (m: SearchMember) => {
    if (currentMemberId != null && m.id === currentMemberId) return;
    setGroupPick((prev) => {
      const next = { ...prev };
      if (next[m.id]) delete next[m.id];
      else next[m.id] = m;
      return next;
    });
  };

  const goWizardBack = () => {
    if (groupWizardStep === 'details') {
      setGroupWizardStep('members');
      setTitleError(null);
      return;
    }
    clearAvatarDraft();
    setMode('contact');
    setSearchQuery('');
    setGroupPick({});
    setTitle('');
    setTitleError(null);
  };

  const goWizardNext = () => {
    if (pickedCount === 0) {
      emitAppToast('Выберите хотя бы одного участника', 'error');
      return;
    }
    setGroupWizardStep('details');
    setTitleError(null);
  };

  const handleCreateGroup = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(mode === 'group' ? 'Введите название группы' : 'Введите название канала');
      emitAppToast(mode === 'group' ? 'Укажите название группы' : 'Укажите название канала', 'error');
      return;
    }
    setTitleError(null);
    setCreating(true);
    const avatarToUpload = avatarDraft;
    try {
      const convMode = mode === 'group' ? 'group' : 'channel';
      const memberIds = Object.keys(groupPick)
        .map(Number)
        .filter((id) => currentMemberId == null || id !== currentMemberId);
      const result = await api.createGroupChat(trimmed, convMode, memberIds);
      const convId = result.conversationId;
      if (result.conversation) {
        handleConvCreated(result.conversation);
      } else {
        await loadConversations({ force: true });
      }

      if (avatarToUpload) {
        try {
          const compressed = await compressImageForMessengerUpload(avatarToUpload.file);
          const up = await api.uploadFile(compressed, { conversationId: convId });
          await api.updateConversation(convId, { avatar_url: up.url });
          const meta = await api.fetchConversationMeta(convId, { bypassCache: true });
          handleConvUpdated(convId, { avatar_url: meta.avatar_url, updated_at: meta.updated_at });
        } catch {
          emitAppToast('Чат создан, но фото не удалось загрузить.', 'error');
        } finally {
          clearAvatarDraft();
        }
      }

      setGroupPick({});
      setTitle('');
      setGroupWizardStep('members');
      onCreated(convId);
    } catch (e) {
      emitAppToast('Не удалось создать чат. Попробуйте ещё раз.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const groupChannelTitle =
    mode === 'group' ? 'Новая группа' : 'Новый канал';
  const nameStepTitle =
    mode === 'group' ? 'Имя группы' : 'Имя канала';

  const onAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      emitAppToast('Выберите файл изображения', 'error');
      e.target.value = '';
      return;
    }
    setAvatarDraft((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
  };

  return (
    <div className="tg-dialog-overlay" style={overlayVisualViewportStyle} onClick={onClose}>
      <div className="tg-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tg-dialog-header">
          <div className="tg-dialog-header-main">
            {mode !== 'contact' ? (
              <button type="button" className="tg-dialog-back" onClick={goWizardBack} aria-label="Назад">
                <LuChevronLeft size={26} strokeWidth={2.2} aria-hidden />
              </button>
            ) : null}
            <h2 className="tg-dialog-title">
              {mode === 'contact'
                ? 'Новое сообщение'
                : groupWizardStep === 'members'
                  ? groupChannelTitle
                  : nameStepTitle}
            </h2>
          </div>
          <button type="button" className="tg-icon-btn" onClick={onClose} aria-label="Закрыть">
            <LuX size={24} />
          </button>
        </div>

        {mode === 'contact' ? (
          <>
            <div className="tg-dialog-search">
              <LuSearch size={20} className="text-stone-400" aria-hidden />
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
                  <button type="button" className="tg-section-btn" onClick={() => setMode('group')}>
                    <div className="tg-section-icon"><LuUsers size={20} aria-hidden /></div>
                    Создать группу
                  </button>
                  <button type="button" className="tg-section-btn" onClick={() => setMode('channel')}>
                    <div className="tg-section-icon"><LuMegaphone size={20} aria-hidden /></div>
                    Создать канал
                  </button>
                </div>
              )}

              {searching ? (
                <div className="tg-empty-state">Поиск...</div>
              ) : sortedContacts.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="tg-member-item"
                  onClick={() => handleOpenChat(u)}
                >
                  <div className="tg-member-avatar" style={{ background: getAvatarColor(String(u.id)) }}>
                    <AppAvatar
                      src={u.avatar_url ?? null}
                      fallback={u.first_name?.[0] || u.name[0]}
                      className="grid h-full w-full place-items-center"
                      imgClassName="h-full w-full rounded-full object-cover"
                    />
                  </div>
                  <div className="tg-member-info">
                    <div className="tg-member-name">{u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.name}</div>
                    <div className="tg-member-status">{memberStatusLine(u)}</div>
                  </div>
                </button>
              ))}

              {!searching && searchQuery && searchResults.length === 0 && (
                <div className="tg-empty-state">Участники не найдены</div>
              )}
            </div>
          </>
        ) : (
          <div
            className="tg-dialog-results"
            style={{
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {groupWizardStep === 'members' ? (
              <>
                <p className="tg-group-hint" style={{ padding: '12px 16px 8px', margin: 0 }}>
                  Шаг 1 из 2 — кого добавить. На следующем шаге укажите название — без него чат не создать.
                </p>
                <div className="tg-dialog-search" style={{ margin: '0 12px', border: '1px solid var(--tg-border)', borderRadius: '10px' }}>
                  <LuSearch size={20} className="text-stone-400" aria-hidden />
                  <input
                    className="tg-dialog-input"
                    placeholder="Поиск по имени..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, minHeight: '140px', overflowY: 'auto', padding: '8px 0' }}>
                  {searching ? (
                    <div className="tg-empty-state">Поиск…</div>
                  ) : (
                    sortedContacts.map((u) => {
                      const isSelf = currentMemberId != null && u.id === currentMemberId;
                      const picked = Boolean(groupPick[u.id]);
                      const canPick = !isSelf && canAddMemberToGroupChat(u);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className="tg-member-item"
                          onClick={() => canPick && toggleGroupMember(u)}
                          style={{ opacity: isSelf || !canPick ? 0.45 : 1, cursor: canPick ? 'pointer' : 'default' }}
                        >
                          <div
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ring-2 ring-stone-200"
                            style={{
                              background: picked ? 'var(--tg-primary)' : 'transparent',
                              color: picked ? 'white' : 'var(--tg-text-muted)',
                            }}
                            aria-hidden
                          >
                            {picked ? '✓' : ''}
                          </div>
                          <div className="tg-member-avatar" style={{ background: getAvatarColor(String(u.id)) }}>
                            <AppAvatar
                              src={u.avatar_url ?? null}
                              fallback={u.first_name?.[0] || u.name[0]}
                              className="grid h-full w-full place-items-center"
                              imgClassName="h-full w-full rounded-full object-cover"
                            />
                          </div>
                          <div className="tg-member-info">
                            <div className="tg-member-name">
                              {u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.name}
                              {isSelf ? ' (вы)' : ''}
                            </div>
                            <div className="tg-member-status">
                              {picked ? 'Выбран(а)' : canPick ? 'Нажмите, чтобы выбрать' : memberStatusLine(u)}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="tg-group-footer">
                  <p className="tg-group-hint" style={{ marginBottom: 10 }}>
                    {pickedCount === 0
                      ? 'Выберите участников — кнопка «Далее» подскажет, если список пуст.'
                      : `Выбрано: ${pickedCount}`}
                  </p>
                  <button
                    type="button"
                    className="tg-compose-btn"
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--tg-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.9375rem',
                    }}
                    onClick={goWizardNext}
                  >
                    Далее
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: '16px 16px 8px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-hidden
                    onChange={onAvatarFileChange}
                  />
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <button
                      type="button"
                      className="tg-group-avatar-wrap"
                      onClick={() => avatarFileInputRef.current?.click()}
                      aria-label={mode === 'group' ? 'Выбрать фото группы' : 'Выбрать фото канала'}
                    >
                      <AppAvatar
                        src={avatarDraft?.url ?? null}
                        className="h-full w-full"
                        imgClassName="h-full w-full object-cover"
                        fallback={
                          <div className="grid h-full w-full place-items-center text-stone-400">
                            {mode === 'group' ? (
                              <LuUsers size={38} strokeWidth={1.8} aria-hidden />
                            ) : (
                              <LuMegaphone size={38} strokeWidth={1.8} aria-hidden />
                            )}
                          </div>
                        }
                      />
                      <span className="tg-group-avatar-overlay">
                        <LuCamera size={18} strokeWidth={2.2} aria-hidden />
                        <span style={{ marginTop: 2 }}>Фото</span>
                      </span>
                    </button>
                    {avatarDraft ? (
                      <button type="button" className="tg-group-avatar-remove" onClick={() => clearAvatarDraft()}>
                        Убрать фото
                      </button>
                    ) : (
                      <p className="tg-group-hint" style={{ margin: '8px 0 0' }}>
                        Фото необязательно — нажмите на круг, чтобы добавить.
                      </p>
                    )}
                  </div>
                  <p className="tg-group-hint" style={{ textAlign: 'center', marginBottom: 14 }}>
                    Шаг 2 из 2 — как чат будет называться в списке.
                  </p>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500" style={{ marginBottom: 6 }}>
                    {mode === 'group' ? 'Название группы' : 'Название канала'}
                  </label>
                  <div className="tg-dialog-search" style={{ border: titleError ? '1px solid #dc2626' : '1px solid var(--tg-border)', borderRadius: '10px' }}>
                    <input
                      autoFocus
                      className="tg-dialog-input"
                      placeholder={mode === 'group' ? 'Например: Молодёжное служение' : 'Например: Объявления'}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (titleError) setTitleError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !creating) {
                          e.preventDefault();
                          void handleCreateGroup();
                        }
                      }}
                    />
                  </div>
                  {titleError ? <p className="tg-field-error">{titleError}</p> : null}
                </div>
                <div className="tg-group-footer">
                  <button
                    type="button"
                    className="tg-compose-btn"
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: creating ? 'var(--tg-text-muted)' : 'var(--tg-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.9375rem',
                    }}
                    disabled={creating}
                    onClick={() => void handleCreateGroup()}
                  >
                    {creating ? 'Создание…' : mode === 'group' ? 'Создать группу' : 'Создать канал'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <style>{DIALOG_STYLES}</style>
    </div>
  );
}
