import { useMemo } from 'react';
import { useChatStore, EMPTY_ARRAY, type ChatTab } from '../chatStore';
import type { ConversationListItem } from '../api/messengerApi';

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-3">
        <SmartTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          unreadAll={getUnreadForTab('all')}
          unreadPersonal={getUnreadForTab('personal')}
          unreadServices={getUnreadForTab('services')}
          unreadNotifications={getUnreadForTab('notifications')}
        />
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
        <div className="space-y-2">
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
    <div className="flex items-center gap-2 rounded-2xl bg-white/80 p-2 shadow-sm ring-1 ring-stone-200/70 backdrop-blur">
      {tabs.map((t) => {
        const isActive = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              'relative inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-extrabold transition',
              isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-stone-600 hover:bg-stone-100/70',
            ].join(' ')}
          >
            <span className="truncate">{t.label}</span>
            {t.unread > 0 ? (
              <span
                className={[
                  'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold',
                  isActive ? 'bg-white/90 text-primary' : 'bg-primary/10 text-primary',
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
  const displayName = getConversationName(conv);
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(conv.id);
  const avatarUrl =
    conv.type === 'private'
      ? (conv.other_member?.avatar_url ?? null)
      : (conv.avatar_url ?? null);
  const lastMsg = conv.last_message;
  const isTyping = typingUsers.length > 0;

  return (
    <button
      type="button"
      role="listitem"
      className={[
        'group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 transition',
        isActive
          ? 'bg-primary text-white shadow-md shadow-primary/25 ring-primary/20'
          : 'bg-white/70 text-stone-800 ring-stone-200/70 hover:bg-white/90 hover:shadow-sm',
      ].join(' ')}
      onClick={onClick}
    >
      <div
        className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl text-white shadow-sm"
        style={{ background: avatarColor }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-[15px] font-extrabold">{avatarLetter}</span>
        )}
        {conv.type === 'private' ? (
          <span
            className={[
              'absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2',
              isActive ? 'border-primary' : 'border-white/80',
              isOnline ? 'bg-emerald-500' : 'bg-stone-300',
            ].join(' ')}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={['truncate text-sm font-extrabold', isActive ? 'text-white' : 'text-stone-900'].join(' ')}>
            {displayName}
          </span>
          {lastMsg ? (
            <span className={['shrink-0 text-[11px] font-bold', isActive ? 'text-white/80' : 'text-stone-400'].join(' ')}>
              {formatTime(lastMsg.created_at)}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={['min-w-0 flex-1 truncate text-xs font-semibold', isActive ? 'text-white/85' : 'text-stone-500'].join(' ')}>
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

          {conv.unread_count > 0 ? (
            <span
              className={[
                'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold',
                isActive ? 'bg-white/90 text-primary' : 'bg-primary text-white',
              ].join(' ')}
            >
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </button>
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
