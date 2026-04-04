import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, EMPTY_ARRAY, type ChatTab } from '../chatStore';
import type { ConversationListItem, PatchMyConversationUiBody } from '../api/messengerApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { LuPin, LuVolume2, LuVolumeX, LuFolderOpen, LuEraser, LuTrash2 } from 'react-icons/lu';

interface ChatListProps {
  onSelect: (id: string) => void;
  activeId: string | null;
}

export function ChatList({ onSelect, activeId }: ChatListProps) {
  const conversations = useChatStore((s) => s.conversations || EMPTY_ARRAY);
  const conversationsLoading = useChatStore((s) => s.conversationsLoading);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const typingByConv = useChatStore((s) => s.typingByConv);
  const activeTab = useChatStore((s) => s.activeTab);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const getUnreadForTab = useChatStore((s) => s.getUnreadForTab);
  const getConversationsForActiveTab = useChatStore((s) => s.getConversationsForActiveTab);

  const filtered = useMemo(() => getConversationsForActiveTab() || EMPTY_ARRAY, [getConversationsForActiveTab, conversations, activeTab]);

  if (conversationsLoading && !conversationsLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-primary" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-semibold text-stone-600">Нет чатов. Нажмите +, чтобы начать.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="shrink-0 px-3 pt-3">
        <SmartTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          unreadAll={getUnreadForTab('all')}
          unreadPersonal={getUnreadForTab('personal')}
          unreadServices={getUnreadForTab('services')}
          unreadNotifications={getUnreadForTab('notifications')}
        />
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2 sm:px-3 [scrollbar-gutter:stable]">
        <div className="space-y-1">
          {filtered.map((conv: ConversationListItem) => (
            <ChatListItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              isOnline={conv.type === 'private' && conv.other_member ? onlineMembers.has(conv.other_member.id) : false}
              typingUsers={typingByConv[conv.id] || EMPTY_ARRAY}
              onClick={() => onSelect(conv.id)}
            />
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-stone-500">Здесь пока пусто</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SmartTabs({
  activeTab,
  onChange,
  unreadAll,
  unreadPersonal,
  unreadServices,
  unreadNotifications,
}: {
  activeTab: ChatTab;
  onChange: (tab: ChatTab) => void;
  unreadAll: number;
  unreadPersonal: number;
  unreadServices: number;
  unreadNotifications: number;
}) {
  const tabs: { id: ChatTab; label: string; unread: number }[] = [
    { id: 'all', label: 'Все', unread: unreadAll },
    { id: 'personal', label: 'Личные', unread: unreadPersonal },
    { id: 'services', label: 'Служения', unread: unreadServices },
    { id: 'notifications', label: 'Уведомления', unread: unreadNotifications },
  ];

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-gray-100 bg-white p-1 shadow-sm">
      {tabs.map((t) => {
        const isActive = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              'relative inline-flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors duration-200',
              isActive
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
            ].join(' ')}
          >
            <span className="truncate">{t.label}</span>
            {t.unread > 0 ? (
              <span
                className={[
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-px text-[10px] font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
                ].join(' ')}
              >
                {t.unread > 99 ? '99+' : t.unread}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 14;

function ChatListItem({
  conv,
  isActive,
  isOnline,
  typingUsers,
  onClick,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  isOnline: boolean;
  typingUsers: { memberId: number; memberName: string }[];
  onClick: () => void;
}) {
  const patchChatMyUi = useChatStore((s) => s.patchChatMyUi);
  const clearChatHistory = useChatStore((s) => s.clearChatHistory);
  const leaveChat = useChatStore((s) => s.leaveChat);

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const closeMenu = useCallback(() => setMenuPos(null), []);

  const openMenuAt = useCallback((clientX: number, clientY: number) => {
    const pad = 8;
    const w = 240;
    const h = 320;
    let x = clientX;
    let y = clientY;
    if (typeof window !== 'undefined') {
      x = Math.min(x, window.innerWidth - w - pad);
      y = Math.min(y, window.innerHeight - h - pad);
      x = Math.max(pad, x);
      y = Math.max(pad, y);
    }
    setMenuPos({ x, y });
  }, []);

  useEffect(() => {
    if (!menuPos) return;
    const onScroll = () => closeMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuPos, closeMenu]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      openMenuAt(e.clientX, e.clientY);
    }, LONG_PRESS_MS);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start || longPressTimerRef.current == null) return;
    if (
      Math.abs(e.clientX - start.x) > MOVE_CANCEL_PX ||
      Math.abs(e.clientY - start.y) > MOVE_CANCEL_PX
    ) {
      clearLongPressTimer();
    }
  };

  const onPointerEnd = () => {
    pointerStartRef.current = null;
    clearLongPressTimer();
  };

  const handleRowClick = () => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onClick();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };

  const displayName = getConversationName(conv);
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(conv.id);
  const avatarUrl =
    conv.type === 'private'
      ? (conv.other_member?.avatar_url ?? null)
      : (conv.avatar_url ?? null);
  const avatarSrc = resolvePublicUrl(avatarUrl);
  const lastMsg = conv.last_message;
  const isTyping = typingUsers.length > 0;
  const isPinned = conv.my_ui_pinned === true;
  const isMuted = conv.my_muted === true;

  const menu = menuPos ? (
    <ChatRowContextMenu
      x={menuPos.x}
      y={menuPos.y}
      conv={conv}
      isPinned={isPinned}
      isMuted={isMuted}
      onClose={closeMenu}
      patchChatMyUi={patchChatMyUi}
      clearChatHistory={clearChatHistory}
      leaveChat={leaveChat}
    />
  ) : null;

  return (
    <>
      <button
        type="button"
        role="listitem"
        className={[
          'group flex w-full touch-manipulation items-center gap-3.5 rounded-2xl border px-3.5 py-2.5 text-left shadow-sm transition-colors duration-200 sm:py-3',
          isActive
            ? 'border-primary/20 bg-primary/95 text-white shadow-md shadow-primary/20'
            : 'border-gray-100 bg-white text-gray-800 hover:border-gray-200 hover:bg-gray-50',
        ].join(' ')}
        onClick={handleRowClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={onContextMenu}
      >
      <div className="relative h-11 w-11 shrink-0 sm:h-12 sm:w-12">
        <div
          className="grid h-11 w-11 place-items-center overflow-hidden rounded-full text-white shadow-sm sm:h-12 sm:w-12"
          style={{ background: avatarColor }}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="text-sm font-extrabold sm:text-[15px]">{avatarLetter}</span>
          )}
        </div>
        {conv.type === 'private' ? (
          <span
            className={[
              'pointer-events-none absolute -bottom-1 -right-1 z-10 h-3.5 w-3.5 rounded-full border-2',
              isActive ? 'border-primary' : 'border-white/80',
              isOnline ? 'bg-emerald-500' : 'bg-stone-300',
            ].join(' ')}
            aria-hidden
          />
        ) : null}
      </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div
            className={['flex min-w-0 items-center gap-1.5 truncate text-[15px] font-semibold tracking-tight', isActive ? 'text-white' : 'text-stone-900'].join(
              ' ',
            )}
          >
            {isPinned ? (
              <LuPin className={['h-3.5 w-3.5 shrink-0', isActive ? 'text-amber-200' : 'text-amber-600'].join(' ')} aria-hidden />
            ) : null}
            {isMuted ? (
              <LuVolumeX className={['h-3.5 w-3.5 shrink-0', isActive ? 'text-white/70' : 'text-gray-400'].join(' ')} aria-hidden />
            ) : null}
            <span className="truncate">{displayName}</span>
          </div>
          {lastMsg ? (
            <span className={['shrink-0 text-xs font-medium', isActive ? 'text-white/80' : 'text-gray-400'].join(' ')}>
              {formatTime(lastMsg.created_at)}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={['min-w-0 flex-1 truncate text-xs font-medium', isActive ? 'text-white/85' : 'text-gray-500'].join(' ')}>
            {isTyping
              ? `${typingUsers.map((u) => u.memberName.split(' ')[0]).join(', ')} печатает…`
              : lastMsg
                ? lastMsg.is_deleted
                  ? 'Сообщение удалено'
                  : lastMsg.sender_name
                    ? `${lastMsg.sender_name.split(' ')[0]}: ${lastMsg.content}`
                    : lastMsg.content
                : 'Нет сообщений'}
          </span>

          {/* Hide unread badge for currently open chat (it is considered read). */}
          {conv.unread_count > 0 && !isActive ? (
            <span
              className={[
                'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold',
                'bg-primary text-white',
              ].join(' ')}
            >
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </button>
      {typeof document !== 'undefined' && menuPos ? createPortal(menu, document.body) : null}
    </>
  );
}

function ChatRowContextMenu({
  x,
  y,
  conv,
  isPinned,
  isMuted,
  onClose,
  patchChatMyUi,
  clearChatHistory,
  leaveChat,
}: {
  x: number;
  y: number;
  conv: ConversationListItem;
  isPinned: boolean;
  isMuted: boolean;
  onClose: () => void;
  patchChatMyUi: (id: string, body: PatchMyConversationUiBody) => Promise<void>;
  clearChatHistory: (id: string) => Promise<void>;
  leaveChat: (id: string) => Promise<void>;
}) {
  const run = async (fn: () => Promise<void>) => {
    onClose();
    await fn();
  };

  return (
    <div
      className="fixed inset-0 z-[6000]"
      style={{ touchAction: 'none' }}
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div
        role="menu"
        aria-label="Действия с чатом"
        className="absolute z-[6001] w-[min(240px,calc(100vw-16px))] overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-xl"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
          onClick={() =>
            run(() => patchChatMyUi(conv.id, { uiPinned: !isPinned }))
          }
        >
          <LuPin className="h-4 w-4 shrink-0 text-amber-600" />
          {isPinned ? 'Открепить' : 'Закрепить'}
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
          onClick={() => run(() => patchChatMyUi(conv.id, { muted: !isMuted }))}
        >
          {isMuted ? (
            <>
              <LuVolume2 className="h-4 w-4 shrink-0 text-emerald-600" />
              Включить звук
            </>
          ) : (
            <>
              <LuVolumeX className="h-4 w-4 shrink-0 text-gray-600" />
              Убрать звук
            </>
          )}
        </button>
        <div className="my-1 border-t border-gray-100" />
        <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">Папка</div>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
          onClick={() => run(() => patchChatMyUi(conv.id, { uiFolder: 'personal' }))}
        >
          <LuFolderOpen className="h-4 w-4 shrink-0 text-sky-600" />
          Личное
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
          onClick={() => run(() => patchChatMyUi(conv.id, { uiFolder: 'ministry' }))}
        >
          <LuFolderOpen className="h-4 w-4 shrink-0 text-violet-600" />
          Служение
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-50"
          onClick={() => run(() => patchChatMyUi(conv.id, { uiFolder: null }))}
        >
          Авто (по типу чата)
        </button>
        <div className="my-1 border-t border-gray-100" />
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-amber-900 hover:bg-amber-50"
          onClick={() => {
            onClose();
            if (
              window.confirm(
                'Удалить все сообщения в этом чате у всех участников? Действие необратимо.',
              )
            ) {
              void clearChatHistory(conv.id);
            }
          }}
        >
          <LuEraser className="h-4 w-4 shrink-0" />
          Очистить переписку
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
          onClick={() => {
            onClose();
            if (
              window.confirm(
                'Удалить чат из списка и выйти из беседы? Для групп вы сможете вернуться только по приглашению.',
              )
            ) {
              void leaveChat(conv.id);
            }
          }}
        >
          <LuTrash2 className="h-4 w-4 shrink-0" />
          Удалить чат
        </button>
      </div>
    </div>
  );
}

function getConversationName(conv: ConversationListItem): string {
  if (conv.type === 'private' && conv.other_member) {
    const fn = conv.other_member.first_name || '';
    const ln = conv.other_member.last_name || '';
    return `${fn} ${ln}`.trim() || conv.other_member.name;
  }
  return conv.title || 'Без названия';
}

const AVATAR_COLORS = [
  '#C0392B', '#E67E22', '#D35400', '#F1C40F',
  '#27AE60', '#16A085', '#2980B9', '#8E44AD',
  '#2C3E50', '#7F8C8D', '#7d3640', '#5c2830'
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const diff = now.getTime() - d.getTime();
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
