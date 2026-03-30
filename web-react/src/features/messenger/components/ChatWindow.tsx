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

  // Load older messages on scroll
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop < 80) {
      void loadMessages(conversationId, true);
    }
  }, [conversationId, loading, hasMore, loadMessages]);

  const headerName = useMemo(() => {
    if (!conv) return '...';
    if (conv.type === 'personal' && conv.other_member) {
      const fn = conv.other_member.first_name || '';
      const ln = conv.other_member.last_name || '';
      return `${fn} ${ln}`.trim() || conv.other_member.name;
    }
    return conv.title || 'Чат';
  }, [conv]);

  const isOnline = conv?.type === 'personal' && conv.other_member && onlineMembers.has(conv.other_member.id);

  const headerSubtitle = useMemo(() => {
    if (!conv) return '';
    if (typingUsers.length > 0) {
      const names = typingUsers.map((u) => u.memberName.split(' ')[0]);
      return `${names.join(', ')} печатает…`;
    }
    if (conv.type === 'personal' && conv.other_member) {
      return isOnline ? 'в сети' : 'не в сети';
    }
    return conv.type === 'channel' ? 'канал' : 'группа';
  }, [conv, typingUsers, isOnline]);

  return (
    <div className="tg-main">
      {/* Header */}
      <header className="tg-chat-header">
        <button type="button" className="tg-back-btn" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="tg-header-info">
          <div className="tg-header-name">{headerName}</div>
          <div className={`tg-header-status ${isOnline || typingUsers.length > 0 ? 'tg-header-status--online' : ''}`}>
            {headerSubtitle}
          </div>
        </div>
      </header>

      {/* Message List */}
      <div 
        className="tg-message-list" 
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {loading && <div className="chatlist-loading"><div className="chatlist-spinner" /></div>}
        
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const next = messages[idx + 1];
          
          const isGroupedPrev = prev && prev.sender_id === msg.sender_id && 
            (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 300000;
            
          const isGroupedNext = next && next.sender_id === msg.sender_id && 
            (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < 300000;

          // Date divider
          const msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long',
          });
          const prevDate = prev ? new Date(prev.created_at).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long',
          }) : null;
          
          return (
            <div key={msg.id} style={{ display: 'contents' }}>
              {msgDate !== prevDate && (
                <div className="tg-date-divider">{msgDate}</div>
              )}
              <MessageBubble 
                message={msg} 
                isGroupedPrev={!!isGroupedPrev}
                isGroupedNext={!!isGroupedNext}
              />
            </div>
          );
        })}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        conversationId={conversationId}
        sendTypingStart={sendTypingStart}
        sendTypingStop={sendTypingStop}
        canSend={conv?.type !== 'channel' || true /* TODO: logic */}
      />
    </div>
  );
}
