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
      <div className="chatlist-loading">
        <div className="chatlist-spinner" />
        <span>Загрузка…</span>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="chatlist-empty">
        <p>Нет чатов</p>
        <p className="chatlist-empty__hint">Нажмите + чтобы начать общение</p>
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
      <style>{chatListStyles}</style>
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
  const avatar = getAvatarLetter(conv);
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
        <span className="chatlist-avatar__letter">{avatar}</span>
        {conv.type === 'personal' && (
          <span className={`chatlist-online ${isOnline ? 'chatlist-online--on' : ''}`} />
        )}
        {conv.type === 'group' && (
          <span className="chatlist-badge-type">👥</span>
        )}
        {conv.type === 'channel' && (
          <span className="chatlist-badge-type">📢</span>
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
              {typingUsers.map((u) => u.memberName).join(', ')} печатает…
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
            <span className="chatlist-preview chatlist-preview--empty">Нет сообщений</span>
          )}

          {conv.unread_count > 0 && (
            <span className="chatlist-unread">{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>
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

function getAvatarLetter(conv: ConversationListItem): string {
  const name = getConversationName(conv);
  return name.charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#a855f7', '#f43f5e',
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
  const diff = now.getTime() - d.getTime();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }  if (diff < 7 * 86400000) {
    return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const chatListStyles = `
  .chatlist-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .chatlist-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .chatlist-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(125, 54, 64, 0.15);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .chatlist-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .chatlist-empty__hint {
    font-size: 0.8125rem;
    margin-top: 4px;
  }

  .chatlist-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 20px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.12s;
    border-bottom: 1px solid rgba(28, 25, 23, 0.04);
  }
  .chatlist-item:hover {
    background: rgba(125, 54, 64, 0.04);
  }
  .chatlist-item--active {
    background: rgba(125, 54, 64, 0.08) !important;
  }

  .chatlist-avatar {
    position: relative;
    width: 48px;
    height: 48px;
    min-width: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 1.125rem;
  }
  .chatlist-avatar__letter {
    line-height: 1;
  }

  .chatlist-online {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--surface-elevated);
    background: #a8a29e;
    transition: background 0.2s;
  }
  .chatlist-online--on {
    background: #22c55e;
  }

  .chatlist-badge-type {
    position: absolute;
    bottom: -2px;
    right: -2px;
    font-size: 14px;
    line-height: 1;
  }

  .chatlist-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .chatlist-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .chatlist-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chatlist-time {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .chatlist-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .chatlist-preview {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .chatlist-preview--empty {
    color: var(--text-muted);
    font-style: italic;
  }

  .chatlist-typing {
    font-size: 0.8125rem;
    color: var(--primary);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    animation: typingPulse 1.5s ease-in-out infinite;
  }

  @keyframes typingPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .chatlist-unread {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: var(--primary);
    color: white;
    font-size: 0.6875rem;
    font-weight: 800;
    flex-shrink: 0;
  }
`;
