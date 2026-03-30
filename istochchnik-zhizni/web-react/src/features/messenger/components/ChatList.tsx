import { useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useChatStore, EMPTY_ARRAY } from '../chatStore';
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
  const typingByConv = useChatStore((s) => s.typingByConv || EMPTY_ARRAY);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (conversationsLoading && !conversationsLoaded) {
    return (
      <div className="tg-empty-state">
        <div className="chatlist-spinner" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="tg-empty-state">
        <p className="tg-empty-sub">Нет чатов. Нажмите +, чтобы начать.</p>
      </div>
    );
  }

  return (
    <div className="chatlist-scroll" ref={scrollRef}>
      <List
        height={scrollRef.current?.clientHeight || 500}
        itemCount={conversations.length}
        itemSize={70}
        width="100%"
      >
        {({ index, style }) => {
          const conv = conversations[index];
          return (
            <div style={style} key={conv.id}>
              <ChatListItem
                conv={conv}
                isActive={conv.id === activeId}
                isOnline={conv.type === 'personal' && conv.other_member ? onlineMembers.has(conv.other_member.id) : false}
                typingUsers={typingByConv[conv.id] || EMPTY_ARRAY}
                onClick={() => onSelect(conv.id)}
              />
            </div>
          );
        }}
      </List>
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
  const lastMsg = conv.last_message;
  const isTyping = typingUsers.length > 0;

  return (
    <button
      type="button"
      className={`chatlist-item ${isActive ? 'chatlist-item--active' : ''}`}
      onClick={onClick}
    >
      <div className="chatlist-avatar" style={{ background: avatarColor }}>
        {avatarLetter}
        {conv.type === 'personal' && (
          <div className={`chatlist-online ${isOnline ? 'chatlist-online--on' : ''}`} />
        )}
      </div>

      <div className="chatlist-content">
        <div className="chatlist-top">
          <span className="chatlist-name">{displayName}</span>
          {lastMsg && (
            <span className="chatlist-time">
              {formatTime(lastMsg.created_at)}
            </span>
          )}
        </div>
        <div className="chatlist-bottom">
          {isTyping ? (
            <span className="chatlist-typing">
              {typingUsers.map((u) => u.memberName.split(' ')[0]).join(', ')} печатает…
            </span>
          ) : lastMsg ? (
            <span className="chatlist-preview">
              {lastMsg.is_deleted
                ? 'Сообщение удалено'
                : lastMsg.sender_name
                  ? `${lastMsg.sender_name.split(' ')[0]}: ${lastMsg.content}`
                  : lastMsg.content}
            </span>
          ) : (
            <span className="chatlist-preview">Нет сообщений</span>
          )}

          {conv.unread_count > 0 && (
            <div className="chatlist-unread">
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </div>
          )}
        </div>
      </div>
      
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function getConversationName(conv: ConversationListItem): string {
  if (conv.type === 'personal' && conv.other_member) {
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
