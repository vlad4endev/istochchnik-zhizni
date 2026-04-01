import { useMemo } from 'react';
import { useChatStore, EMPTY_ARRAY, type ChatTab } from '../chatStore';
import type { ConversationListItem } from '../api/messengerApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

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
  const avatarSrc = resolvePublicUrl(avatarUrl);
  const lastMsg = conv.last_message;
  const isTyping = typingUsers.length > 0;

  return (
    <button
      type="button"
      role="listitem"
      className={[
        'group flex w-full items-center gap-3.5 rounded-2xl border px-3.5 py-2.5 text-left shadow-sm transition-colors duration-200 sm:py-3',
        isActive
          ? 'border-primary/20 bg-primary/95 text-white shadow-md shadow-primary/20'
          : 'border-gray-100 bg-white text-gray-800 hover:border-gray-200 hover:bg-gray-50',
      ].join(' ')}
      onClick={onClick}
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
          <div className={['truncate text-[15px] font-semibold tracking-tight', isActive ? 'text-white' : 'text-stone-900'].join(' ')}>
            {displayName}
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
