import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, EMPTY_ARRAY, type ChatTab } from '../chatStore';
import type { ConversationListItem, PatchMyConversationUiBody } from '../api/messengerApi';
import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { getAvatarColor, getAvatarInitial } from '../avatarUtils';
import { LuPin, LuVolume2, LuVolumeX, LuFolderOpen, LuEraser, LuTrash2 } from 'react-icons/lu';
import { IoCheckmarkDone } from 'react-icons/io5';

interface ChatListProps {
  onSelect: (id: string) => void;
  activeId: string | null;
}

export function ChatList({ onSelect, activeId }: ChatListProps) {
  const conversations = useChatStore((s) => s.conversations || EMPTY_ARRAY);
  const conversationsLoading = useChatStore((s) => s.conversationsLoading);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const activeTab = useChatStore((s) => s.activeTab);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const getUnreadForTab = useChatStore((s) => s.getUnreadForTab);
  const getConversationsForActiveTab = useChatStore((s) => s.getConversationsForActiveTab);

  const filtered = useMemo(() => getConversationsForActiveTab() || EMPTY_ARRAY, [getConversationsForActiveTab, conversations, activeTab]);

  if (conversationsLoading && !conversationsLoaded) {
    return (
      <div className="tg-chatlist-root flex min-h-0 flex-1 flex-col bg-white">
        <div className="shrink-0 border-b border-gray-200/60 px-3 pb-2 pt-2 md:px-4">
          <div className="flex items-center gap-1 rounded-2xl border border-gray-100 bg-white p-1 shadow-sm">
            <SkeletonBox height="32px" radius="10px" />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2 md:px-3" aria-busy="true" aria-label="Загрузка чатов">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <SkeletonBox width="44px" height="44px" radius="9999px" />
              <div className="min-w-0 flex-1">
                <SkeletonBox height="13px" width={i % 2 === 0 ? '62%' : '48%'} />
                <SkeletonBox className="mt-2" height="11px" width={i % 2 === 0 ? '84%' : '76%'} />
              </div>
            </div>
          ))}
        </div>
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
    <div className="tg-chatlist-root flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-gray-200/60 px-3 pt-2 pb-2 md:px-4">
        <SmartTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          unreadAll={getUnreadForTab('all')}
          unreadPersonal={getUnreadForTab('personal')}
          unreadServices={getUnreadForTab('services')}
          unreadNotifications={getUnreadForTab('notifications')}
        />
      </div>

      <div className="tg-chatlist-scroll chats-scroll-area min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <ul className="list-none" role="list">
          {filtered.map((conv: ConversationListItem, index: number) => (
            <li key={conv.id}>
              <ChatListItem
                conv={conv}
                isActive={conv.id === activeId}
                isLast={index === filtered.length - 1}
                avatarPriority={index < 16 || conv.id === activeId}
                onClick={() => onSelect(conv.id)}
              />
            </li>
          ))}
        </ul>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-gray-500">Здесь пока пусто</p>
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
  isLast,
  avatarPriority,
  onClick,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  /** Последняя строка — без нижнего разделителя у текстовой колонки. */
  isLast: boolean;
  /** Первые строки списка + активный чат — eager-загрузка фото. */
  avatarPriority: boolean;
  onClick: () => void;
}) {
  const typingUsers = useChatStore((s) => s.typingByConv[conv.id] || EMPTY_ARRAY);
  const isOnline = useChatStore((s) => {
    if (conv.type !== 'private' || !conv.other_member) return false;
    return s.onlineMembers.has(conv.other_member.id);
  });
  const currentMemberId = useChatStore((s) => s.currentMemberId);
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
  const avatarLetter = getAvatarInitial(displayName);
  const avatarColor = getAvatarColor(conv.id);
  const avatarUrl =
    conv.type === 'private'
      ? (conv.other_member?.avatar_url ?? null)
      : (conv.avatar_url ?? null);
  const lastMsg = conv.last_message;
  const isTyping = typingUsers.length > 0;
  const isPinned = conv.my_ui_pinned === true;
  const isMuted = conv.my_muted === true;
  const lastFromMe =
    lastMsg?.sender_id != null &&
    currentMemberId != null &&
    Number(lastMsg.sender_id) === Number(currentMemberId);
  const previewLine = isTyping
    ? `${typingUsers.map((u) => u.memberName.split(' ')[0]).join(', ')} печатает…`
    : lastMsg
      ? lastMsg.is_deleted
        ? 'Сообщение удалено'
        : lastMsg.sender_name
          ? `${lastMsg.sender_name.split(' ')[0]}: ${lastMsg.content}`
          : lastMsg.content
      : 'Нет сообщений';
  const showUnreadBadge = conv.unread_count > 0 && !isActive;
  const showOutgoingChecks = lastFromMe && !showUnreadBadge && !isTyping;

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
          'tg-chat-row flex w-full touch-manipulation text-left transition-colors duration-150',
          'active:bg-gray-100',
          isActive ? 'bg-primary/[0.07]' : 'bg-white hover:bg-gray-50/90',
        ].join(' ')}
        onClick={handleRowClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={onContextMenu}
      >
        {/* Колонка аватара: без нижней линии (как в Telegram). */}
        <div className="flex shrink-0 items-center py-2 pl-3 pr-2">
          <div className="relative h-12 w-12 shrink-0">
            <div
              className="grid h-12 w-12 place-items-center overflow-hidden rounded-full text-[15px] font-bold text-white"
              style={{ background: avatarColor }}
            >
              <AppAvatar
                src={avatarUrl}
                fallback={<span>{avatarLetter}</span>}
                priority={avatarPriority}
                className="grid h-full w-full place-items-center"
                imgClassName="h-full w-full object-cover"
              />
            </div>
            {conv.type === 'private' ? (
              <span
                className={[
                  'pointer-events-none absolute bottom-0 right-0 z-10 h-3 w-3 rounded-full border-[2px] border-white',
                  isOnline ? 'bg-emerald-500' : 'bg-gray-300',
                ].join(' ')}
                aria-hidden
              />
            ) : null}
          </div>
        </div>

        {/* Текст: разделитель только здесь — от левого края текста до правого края экрана. */}
        <div
          className={[
            'flex min-w-0 flex-1 flex-col justify-center py-2 pr-3',
            !isLast ? 'border-b border-gray-200/60' : '',
          ].join(' ')}
        >
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {isPinned ? (
                <LuPin className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              ) : null}
              {isMuted ? (
                <LuVolumeX className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              ) : null}
              <span className="truncate font-semibold text-gray-900">{displayName}</span>
            </div>
            {lastMsg ? (
              <time
                className="shrink-0 whitespace-nowrap text-xs text-gray-500 tabular-nums"
                dateTime={lastMsg.created_at}
              >
                {formatTime(lastMsg.created_at)}
              </time>
            ) : null}
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <p
              className={[
                'min-w-0 flex-1 truncate text-sm leading-snug',
                isTyping ? 'font-medium text-primary' : 'text-gray-500',
              ].join(' ')}
            >
              {previewLine}
            </p>
            <div className="flex shrink-0 items-center justify-end">
              {showUnreadBadge ? (
                <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </span>
              ) : showOutgoingChecks ? (
                <IoCheckmarkDone
                  className="h-[18px] w-[18px] shrink-0 text-primary/70"
                  aria-label="Исходящее сообщение"
                />
              ) : null}
            </div>
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
