import { useChatStore } from '../chatStore';
import type { ConversationListItem } from '../api/messengerApi';

interface ChatListProps {
  onSelect: (id: string) => void;
  activeId: string | null;
}

export function ChatList({ onSelect, activeId }: ChatListProps) {
  const conversations = useChatStore((s) => s.conversations);
  const conversationsLoading = useChatStore((s) => s.conversationsLoading);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const typingByConv = useChatStore((s) => s.typingByConv);

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
    <div className="chatlist-scroll">
      {conversations.map((conv) => (
        <ChatListItem
          key={conv.id}
          conv={conv}
          isActive={conv.id === activeId}
          isOnline={conv.type === 'personal' && conv.other_member ? onlineMembers.has(conv.other_member.id) : false}
          typingUsers={typingByConv[conv.id] || []}
          onClick={() => onSelect(conv.id)}
        />
      ))}
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
      
      <style>{`
        .chatlist-online {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid var(--tg-surface);
          background: #a8a29e;
        }
        .chatlist-online--on {
          background: #22c55e;
        }
        .chatlist-item--active .chatlist-online {
          border-color: var(--tg-primary);
        }
        
        .chatlist-typing {
          color: var(--tg-primary);
          font-style: italic;
          font-size: 0.8125rem;
          animation: typingPulse 1.5s infinite;
        }
        @keyframes typingPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
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
