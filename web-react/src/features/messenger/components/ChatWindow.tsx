import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useChatStore } from '../chatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

interface ChatWindowProps {
  conversationId: string;
  onBack: () => void;
  sendTypingStart: (convId: string) => void;
  sendTypingStop: (convId: string) => void;
}

export function ChatWindow({
  conversationId,
  onBack,
  sendTypingStart,
  sendTypingStop,
}: ChatWindowProps) {
  const messages = useChatStore((s) => s.messagesByConv[conversationId] || []);
  const loading = useChatStore((s) => s.messagesLoading[conversationId] || false);
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? true);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const conversations = useChatStore((s) => s.conversations);
  const typingUsers = useChatStore((s) => s.typingByConv[conversationId] || []);
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const markRead = useChatStore((s) => s.markRead);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  const conv = conversations.find((c) => c.id === conversationId);

  // Load messages on mount
  useEffect(() => {
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      // Only auto-scroll if near bottom
      const el = scrollContainerRef.current;
      if (el) {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
        if (isNearBottom || prevLenRef.current === 0) {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: prevLenRef.current === 0 ? 'auto' : 'smooth' });
          });
        }
      }
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  // Mark as read when viewing
  useEffect(() => {
    if (messages.length > 0) {
      void markRead(conversationId);
    }
  }, [conversationId, messages.length, markRead]);

  // Load older messages on scroll to top
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop < 80) {
      void loadMessages(conversationId, true);
    }
  }, [conversationId, loading, hasMore, loadMessages]);

  // Conversation header info
  const headerName = useMemo(() => {
    if (!conv) return '...';
    if (conv.type === 'personal' && conv.other_member) {
      const fn = conv.other_member.first_name || '';
      const ln = conv.other_member.last_name || '';
      return `${fn} ${ln}`.trim() || conv.other_member.name;
    }
    return conv.title || 'Чат';
  }, [conv]);

  const headerSubtitle = useMemo(() => {
    if (!conv) return '';
    if (typingUsers.length > 0) {
      const names = typingUsers.map((u) => u.memberName.split(' ')[0]);
      return `${names.join(', ')} печатает…`;
    }
    if (conv.type === 'personal' && conv.other_member) {
      return onlineMembers.has(conv.other_member.id) ? 'в сети' : 'не в сети';
    }
    return conv.type === 'channel' ? 'Канал' : 'Группа';
  }, [conv, typingUsers, onlineMembers]);

  const isTypingActive = typingUsers.length > 0;
  const isOnline = conv?.type === 'personal' && conv.other_member
    ? onlineMembers.has(conv.other_member.id)
    : false;

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: typeof messages }[] = [];
    let currentDate = '';
    for (const msg of messages) {
      const msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [messages]);

  return (
    <div className="chatwindow">
      {/* Header */}
      <div className="chatwindow-header">
        <button type="button" className="chatwindow-back" onClick={onBack} aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="chatwindow-header__info">
          <span className="chatwindow-header__name">{headerName}</span>
          <span className={`chatwindow-header__status ${isTypingActive ? 'chatwindow-header__status--typing' : isOnline ? 'chatwindow-header__status--online' : ''}`}>
            {headerSubtitle}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        className="chatwindow-messages"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {loading && (
          <div className="chatwindow-loader">
            <div className="chatlist-spinner" />
          </div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="chatwindow-date-divider">
              <span>{group.date}</span>
            </div>
            {group.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        conversationId={conversationId}
        sendTypingStart={sendTypingStart}
        sendTypingStop={sendTypingStop}
        canSend={conv?.type !== 'channel' || (conv?.type === 'channel' && true /* TODO: check role */)}
      />

      <style>{chatWindowStyles}</style>
    </div>
  );
}

const chatWindowStyles = `
  .chatwindow {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
    overflow: hidden;
  }

  .chatwindow-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface-elevated);
    border-bottom: 1px solid rgba(28, 25, 23, 0.08);
    min-height: 60px;
  }

  .chatwindow-back {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .chatwindow-back:hover {
    background: rgba(28, 25, 23, 0.05);
  }

  @media (max-width: 767px) {
    .chatwindow-back {
      display: flex;
    }
  }

  .chatwindow-header__info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .chatwindow-header__name {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chatwindow-header__status {
    font-size: 0.75rem;
    color: var(--text-muted);
    transition: color 0.2s;
  }
  .chatwindow-header__status--online {
    color: #22c55e;
  }
  .chatwindow-header__status--typing {
    color: var(--primary);
    animation: typingPulse 1.5s ease-in-out infinite;
  }

  .chatwindow-messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: auto;
  }

  .chatwindow-loader {
    display: flex;
    justify-content: center;
    padding: 12px;
  }

  .chatwindow-date-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 0 8px;
  }
  .chatwindow-date-divider span {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--surface);
    padding: 4px 12px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    box-shadow: 0 1px 4px rgba(28, 25, 23, 0.06);
  }
`;
