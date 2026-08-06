import { memo, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, EMPTY_ARRAY, type ChatTab } from '../chatStore';
import type { ConversationListItem, PatchMyConversationUiBody } from '../api/messengerApi';
import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { getAvatarColor, getAvatarInitial } from '../avatarUtils';
import { MessengerPlainText, renderMessengerPlainText } from '../messengerPlainText';
import { LuBot, LuPin, LuVolume2, LuVolumeX, LuFolderOpen, LuEraser, LuTrash2, LuSearch } from 'react-icons/lu';
import { IoCheckmark, IoCheckmarkDone } from 'react-icons/io5';
import { isAssistantMessengerChannel } from '../messengerChannelKinds';

interface ChatListProps {
  onSelect: (id: string) => void;
  activeId: string | null;
}

/** Макс. id прочтения среди других участников (для галочек исходящего в строке списка). */
function maxOtherReadCursorIdForRow(
  cursorMap: Record<number, string> | undefined,
  currentMemberId: number | null,
): string {
  if (!cursorMap) return '0';
  let max = 0n;
  for (const [memberId, msgId] of Object.entries(cursorMap)) {
    if (currentMemberId != null && Number(memberId) === Number(currentMemberId)) continue;
    if (typeof msgId === 'string' && /^\d+$/.test(msgId)) {
      const b = BigInt(msgId);
      if (b > max) max = b;
    }
  }
  return max === 0n ? '0' : max.toString();
}

function isHiddenTestConversation(conv: ConversationListItem): boolean {
  let raw = '';
  if (conv.type === 'private' && conv.other_member) {
    const fn = conv.other_member.first_name || '';
    const ln = conv.other_member.last_name || '';
    raw = `${fn} ${ln}`.trim() || conv.other_member.name || '';
  } else {
    raw = conv.title || '';
  }
  const name = raw.trim().toLowerCase();
  if (!name) return false;
  return /^test\s/i.test(name) || name === 'test' || name === 'тест';
}

export const ChatList = memo(function ChatList({ onSelect, activeId }: ChatListProps) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.count('render:ChatList');
  }
  const conversations = useChatStore((s) => s.conversations || EMPTY_ARRAY);
  const conversationsLoading = useChatStore((s) => s.conversationsLoading);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const activeTab = useChatStore((s) => s.activeTab);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const getUnreadForTab = useChatStore((s) => s.getUnreadForTab);
  const getConversationsForActiveTab = useChatStore((s) => s.getConversationsForActiveTab);
  const [listSearchQuery, setListSearchQuery] = useState('');

  const filtered = useMemo(() => getConversationsForActiveTab() || EMPTY_ARRAY, [getConversationsForActiveTab, conversations, activeTab]);
  const unreadByTab = useMemo(
    () => ({
      all: getUnreadForTab('all'),
      personal: getUnreadForTab('personal'),
      services: getUnreadForTab('services'),
      notifications: getUnreadForTab('notifications'),
    }),
    [getUnreadForTab, conversations],
  );

  const visibleChats = useMemo(() => {
    const base = filtered.filter((c) => !isHiddenTestConversation(c));
    const q = listSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) => getConversationName(c).toLowerCase().includes(q));
  }, [filtered, listSearchQuery]);

  if (conversationsLoading && !conversationsLoaded) {
    return (
      <div className="tg-chatlist-root flex min-h-0 flex-1 flex-col bg-[var(--surface-elevated)]">
        <div className="shrink-0 border-b border-stone-200/60 px-3 pb-2 pt-2 md:px-4">
          <div className="flex items-center gap-1 rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-1 shadow-sm">
            <SkeletonBox height="32px" radius="10px" />
          </div>
        </div>
        <div
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:px-3"
          aria-busy="true"
          aria-label="Загрузка чатов"
        >
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
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Нет чатов. Нажмите +, чтобы начать.</p>
      </div>
    );
  }

  return (
    <div className="tg-chatlist-root flex min-h-0 flex-1 flex-col bg-[var(--surface-elevated)]">
      <div className="tg-chatlist-toolbar shrink-0">
        <ChatListSearch value={listSearchQuery} onChange={setListSearchQuery} />
        <SmartTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          unreadAll={unreadByTab.all}
          unreadPersonal={unreadByTab.personal}
          unreadServices={unreadByTab.services}
          unreadNotifications={unreadByTab.notifications}
        />
      </div>

      <div className="tg-chatlist-scroll chats-scroll-area min-h-0 flex-1 overflow-y-auto bg-[var(--surface-elevated)] [scrollbar-gutter:stable] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <ul className="min-h-full w-full list-none bg-[var(--surface-elevated)]" role="list">
          {visibleChats.map((conv: ConversationListItem, index: number) => (
            <li key={conv.id}>
              <MemoChatListItem
                conv={conv}
                isActive={conv.id === activeId}
                isLast={index === visibleChats.length - 1}
                avatarPriority={index < 16 || conv.id === activeId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
        {visibleChats.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              {listSearchQuery.trim() ? 'Ничего не найдено' : 'Здесь пока пусто'}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function ChatListSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="tg-chatlist-search">
      <LuSearch size={14} className="tg-chatlist-search__icon" aria-hidden />
      <input
        type="search"
        className="tg-chatlist-search__input"
        placeholder="Поиск"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        aria-label="Поиск чатов"
      />
    </label>
  );
}

const CHAT_FILTER_TABS: { id: ChatTab; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'personal', label: 'Личные' },
  { id: 'services', label: 'Служения' },
  { id: 'notifications', label: 'Уведомления' },
];

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
  const [pressedId, setPressedId] = useState<ChatTab | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Partial<Record<ChatTab, HTMLButtonElement | null>>>({});

  const unreadByTab: Record<ChatTab, number> = {
    all: unreadAll,
    personal: unreadPersonal,
    services: unreadServices,
    notifications: unreadNotifications,
  };

  const clearPressed = useCallback(() => setPressedId(null), []);

  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch {
      el.scrollIntoView(false);
    }
  }, [activeTab]);

  const selectTab = useCallback(
    (id: ChatTab) => {
      clearPressed();
      if (id !== activeTab) onChange(id);
    },
    [activeTab, clearPressed, onChange],
  );

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, id: ChatTab) => {
      const idx = CHAT_FILTER_TABS.findIndex((t) => t.id === id);
      if (idx < 0) return;
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(CHAT_FILTER_TABS.length - 1, idx + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, idx - 1);
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = CHAT_FILTER_TABS.length - 1;
      if (next < 0 || next === idx) return;
      e.preventDefault();
      const nextId = CHAT_FILTER_TABS[next].id;
      selectTab(nextId);
      tabRefs.current[nextId]?.focus();
    },
    [selectTab],
  );

  return (
    <div
      ref={scrollerRef}
      className="tg-smart-tabs-scroll"
      role="tablist"
      aria-label="Фильтр чатов"
    >
      {CHAT_FILTER_TABS.map((t) => {
        const isActive = t.id === activeTab;
        const unread = unreadByTab[t.id] ?? 0;
        return (
          <button
            key={t.id}
            ref={(node) => {
              tabRefs.current[t.id] = node;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => selectTab(t.id)}
            onKeyDown={(e) => onTabKeyDown(e, t.id)}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              setPressedId(t.id);
            }}
            onPointerUp={clearPressed}
            onPointerCancel={clearPressed}
            onPointerLeave={clearPressed}
            onBlur={clearPressed}
            className={[
              'tg-smart-tab',
              'tab-filter-button',
              isActive ? 'tg-smart-tab--active' : '',
              pressedId === t.id ? 'tg-smart-tab--pressed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="tg-smart-tab__label">{t.label}</span>
            {unread > 0 ? (
              <span
                className={[
                  'tg-smart-tab__badge',
                  isActive ? 'tg-smart-tab__badge--active' : 'tg-smart-tab__badge--inactive',
                ].join(' ')}
                aria-label={`Непрочитанных: ${unread > 99 ? 'более 99' : unread}`}
              >
                {unread > 99 ? '99+' : unread}
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

/** Точечная подписка на presence одного участника — не тянет ререндер строки списка. */
const PrivateChatOnlineIndicator = memo(function PrivateChatOnlineIndicator({
  memberId,
}: {
  memberId: number;
}) {
  const isOnline = useChatStore((s) => s.onlineMembers.has(memberId));
  /* Как в UI-ките: точка только когда человек в сети (серый offline не рисуем). */
  if (!isOnline) return null;
  return <span className="chatlist-online chatlist-online--on" aria-hidden />;
});

function ChatListItem({
  conv,
  isActive,
  isLast,
  avatarPriority,
  onSelect,
}: ChatListItemProps) {
  const handleSelect = useCallback(() => {
    onSelect(conv.id);
  }, [conv.id, onSelect]);

  const othersReadMaxId = useChatStore((s) =>
    maxOtherReadCursorIdForRow(s.readCursorsByConv[conv.id], s.currentMemberId),
  );

  const typingUsers = useChatStore((s) => s.typingByConv[conv.id] || EMPTY_ARRAY);
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
    const root = document.getElementById('root');
    window.addEventListener('scroll', onScroll, true);
    root?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      root?.removeEventListener('scroll', onScroll);
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
    handleSelect();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };

  const displayName = getConversationName(conv);
  const isAssistantChat = isAssistantMessengerChannel(conv.metadata);
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
  const previewContent = lastMsg?.content ? String(lastMsg.content) : '';
  const previewLineRaw = isTyping
    ? (() => {
        const names = typingUsers.map((u) => u.memberName.split(' ')[0]).filter(Boolean);
        const verb = names.length > 1 ? 'печатают' : 'печатает';
        return `${names.join(', ')} ${verb}…`;
      })()
    : lastMsg
      ? lastMsg.is_deleted
        ? 'Сообщение удалено'
        : lastFromMe
          ? previewContent
          : lastMsg.sender_name
            ? `${lastMsg.sender_name.split(' ')[0]}: ${previewContent}`
            : previewContent
      : 'Нет сообщений';
  const showUnreadBadge = conv.unread_count > 0 && !isActive;
  const showOutgoingChecks = lastFromMe && !showUnreadBadge && !isTyping;
  const outgoingReadByOthers = (() => {
    if (!lastMsg || !lastFromMe) return false;
    if (lastMsg.read_by_others === true) return true;
    const mid = String(lastMsg.id ?? '').trim();
    const maxR = String(othersReadMaxId ?? '').trim();
    if (!/^\d+$/.test(mid) || !/^\d+$/.test(maxR)) return false;
    try {
      return BigInt(mid) <= BigInt(maxR);
    } catch {
      return false;
    }
  })();

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
        className={[
          'tg-chat-row flex w-full touch-manipulation text-left subpixel-antialiased transition-colors duration-150',
          'active:bg-[var(--bg-hover,var(--surface))]',
          isActive ? 'bg-primary/[0.07]' : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface)]',
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
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full">
              {isAssistantChat ? (
                <span
                  className="grid h-full w-full place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/15"
                  aria-hidden
                >
                  <LuBot className="h-6 w-6" strokeWidth={2} />
                </span>
              ) : (
                <AppAvatar
                  src={avatarUrl}
                  initialsFallbackText={displayName}
                  initialsColorSeed={conv.id}
                  fallback={
                    <span
                      className="grid h-full w-full place-items-center text-base font-bold text-white"
                      style={{ background: avatarColor }}
                    >
                      {avatarLetter}
                    </span>
                  }
                  priority={avatarPriority}
                  width={48}
                  height={48}
                  className="grid h-full w-full place-items-center"
                  imgClassName="h-full w-full object-cover"
                />
              )}
            </div>
            {conv.type === 'private' && conv.other_member ? (
              <PrivateChatOnlineIndicator memberId={conv.other_member.id} />
            ) : null}
          </div>
        </div>

        {/* Текст: разделитель только здесь — от левого края текста до правого края экрана. */}
        <div
          className={[
            'flex min-w-0 flex-1 flex-col justify-center py-2 pr-3',
            !isLast ? 'border-b border-[color:var(--tg-row-divider,var(--tg-border))]' : '',
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
              <span className="chatlist-name truncate font-semibold text-[var(--text)]">{displayName}</span>
            </div>
            {lastMsg ? (
              <time
                className="chatlist-time shrink-0 whitespace-nowrap text-xs text-[var(--text-secondary)] tabular-nums messenger-bidi-text"
                dateTime={lastMsg.created_at}
              >
                <MessengerPlainText text={formatTime(lastMsg.created_at)} keyPrefix="time" />
              </time>
            ) : null}
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <p
              className={[
                'chatlist-preview messenger-bidi-text min-w-0 flex-1 truncate text-sm leading-snug',
                isTyping ? 'font-medium text-primary' : 'text-[var(--text-secondary)]',
              ].join(' ')}
            >
              {renderMessengerPlainText(previewLineRaw, 'preview')}
            </p>
            <div className="flex shrink-0 items-center justify-end">
              {showUnreadBadge ? (
                <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </span>
              ) : showOutgoingChecks ? (
                outgoingReadByOthers ? (
                  <IoCheckmarkDone
                    className="h-[18px] w-[18px] shrink-0 text-sky-600"
                    aria-label="Прочитано"
                  />
                ) : (
                  <IoCheckmark
                    className="h-[18px] w-[18px] shrink-0 text-primary/60"
                    aria-label="Отправлено, ещё не прочитано"
                  />
                )
              ) : null}
            </div>
          </div>
        </div>
      </button>
      {typeof document !== 'undefined' && menuPos ? createPortal(menu, document.body) : null}
    </>
  );
}

type ChatListItemProps = {
  conv: ConversationListItem;
  isActive: boolean;
  /** Последняя строка — без нижнего разделителя у текстовой колонки. */
  isLast: boolean;
  /** Первые строки списка + активный чат — eager-загрузка фото. */
  avatarPriority: boolean;
  onSelect: (id: string) => void;
};

const MemoChatListItem = memo(
  ChatListItem,
  (prev, next) => prev.conv === next.conv && prev.isActive === next.isActive,
);


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
        className="absolute z-[6001] w-[min(240px,calc(100%-16px))] overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] py-1 shadow-xl"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
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
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
          onClick={() => run(() => patchChatMyUi(conv.id, { muted: !isMuted }))}
        >
          {isMuted ? (
            <>
              <LuVolume2 className="h-4 w-4 shrink-0 text-emerald-600" />
              Включить звук
            </>
          ) : (
            <>
              <LuVolumeX className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
              Убрать звук
            </>
          )}
        </button>
        <div className="my-1 border-t border-stone-200/70" />
        <div className="px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Папка</div>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
          onClick={() => run(() => patchChatMyUi(conv.id, { uiFolder: 'personal' }))}
        >
          <LuFolderOpen className="h-4 w-4 shrink-0 text-sky-600" />
          Личное
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
          onClick={() => run(() => patchChatMyUi(conv.id, { uiFolder: 'ministry' }))}
        >
          <LuFolderOpen className="h-4 w-4 shrink-0 text-violet-600" />
          Служение
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
          onClick={() => run(() => patchChatMyUi(conv.id, { uiFolder: null }))}
        >
          Авто (по типу чата)
        </button>
        <div className="my-1 border-t border-stone-200/70" />
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
