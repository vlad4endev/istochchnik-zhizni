import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useChatStore, EMPTY_ARRAY } from '../chatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SearchChat } from './SearchChat';
import { LuArrowLeft, LuInfo, LuSearch } from 'react-icons/lu';
import './messenger.css';

interface ChatWindowProps {
  conversationId: string;
  onBack: () => void;
  sendTypingStart: (id: string) => void;
  sendTypingStop: (id: string) => void;
}

export function ChatWindow({
  conversationId,
  onBack,
  sendTypingStart,
  sendTypingStop,
}: ChatWindowProps) {
  const messages = useChatStore((s) => s.messagesByConv[conversationId] || EMPTY_ARRAY);
  const loading = useChatStore((s) => s.messagesLoading[conversationId] || false);
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? true);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const markRead = useChatStore((s) => s.markRead);
  const conversations = useChatStore((s) => s.conversations);
  const typingUsers = useChatStore((s) => s.typingByConv[conversationId] || EMPTY_ARRAY);
  const onlineMembers = useChatStore((s) => s.onlineMembers);

  const scrollRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSearch, setShowSearch] = useState(false);

  const conv = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);

  // Load messages on mount
  useEffect(() => {
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      void markRead(conversationId);
    }
  }, [conversationId, messages.length, markRead]);

  // Auto-scroll to newest message
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);

  const handleScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    if (scrollOffset === 0 && hasMore && !loading) {
      void loadMessages(conversationId, true);
    }
  }, [conversationId, hasMore, loading, loadMessages]);

  const displayName = useMemo(() => {
    if (!conv) return 'Чат';
    if (conv.type === 'personal' && conv.other_member) {
      const fn = conv.other_member.first_name || '';
      const ln = conv.other_member.last_name || '';
      return `${fn} ${ln}`.trim() || conv.other_member.name;
    }
    return conv.title || 'Чат';
  }, [conv]);

  const isOnline = conv?.type === 'personal' && conv.other_member && onlineMembers.has(conv.other_member.id);

  const headerSubtitle = useMemo(() => {
    if (typingUsers.length > 0) {
      return `${typingUsers.map((u: any) => u.memberName.split(' ')[0]).join(', ')} печатает...`;
    }
    if (!conv) return '';
    if (conv.type === 'personal' && conv.other_member) {
      return isOnline ? 'в сети' : 'был(а) недавно';
    }
    return conv.type === 'channel' ? 'канал' : 'группа';
  }, [conv, typingUsers, isOnline]);

  const groupedMessages = useMemo(() => {
    return messages.map((msg: any, idx: number) => {
      const prev = messages[idx - 1];
      const next = messages[idx + 1];
      const isGroupedPrev = prev && prev.sender_id === msg.sender_id && 
        (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 300000;
      const isGroupedNext = next && next.sender_id === msg.sender_id && 
        (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < 300000;
      const msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const prevDate = prev ? new Date(prev.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : null;
      return { ...msg, isGroupedPrev: !!isGroupedPrev, isGroupedNext: !!isGroupedNext, showDate: msgDate !== prevDate, dateLabel: msgDate };
    });
  }, [messages]);

  return (
    <div className="tg-chat-window">
      <header className="tg-header">
        <button className="tg-icon-btn tg-header-back" onClick={onBack} aria-label="Назад">
          <LuArrowLeft size={24} />
        </button>
        <div className="tg-header-info">
          <div className="tg-header-name">{displayName}</div>
          <div className={`tg-header-status ${typingUsers.length > 0 ? 'tg-header-status--typing' : ''}`}>
            {headerSubtitle}
          </div>
        </div>
        <div className="tg-header-actions">
          <button
            className="tg-icon-btn"
            onClick={() => setShowSearch(true)}
            aria-label="Поиск"
          >
            <LuSearch size={22} />
          </button>
          <button className="tg-icon-btn"><LuInfo size={22} /></button>
          <button className="tg-icon-btn">
             <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>⋮</div>
          </button>
        </div>
      </header>

      <div className="tg-messages" ref={containerRef}>
        {messages.length === 0 && !loading ? (
          <div className="tg-empty-chat"><span>Нет сообщений</span></div>
        ) : (
          <List
            ref={scrollRef}
            height={containerRef.current?.offsetHeight || 400}
            itemCount={groupedMessages.length + (hasMore ? 1 : 0)}
            itemSize={85}
            width="100%"
            onScroll={handleScroll}
            className="tg-messages-virtual"
          >
            {({ index, style }) => {
              if (index === 0 && hasMore) {
                return (
                  <div style={style} className="tg-loading-older">
                    {loading ? 'Загрузка...' : 'Потяните для загрузки'}
                  </div>
                );
              }
              const msgIndex = hasMore ? index - 1 : index;
              const msg = groupedMessages[msgIndex];
              return (
                <div style={style} key={msg.id}>
                  {msg.showDate && <div className="tg-date-divider"><span>{msg.dateLabel}</span></div>}
                  <MessageBubble message={msg} isGroupedPrev={msg.isGroupedPrev} isGroupedNext={msg.isGroupedNext} />
                </div>
              );
            }}
          </List>
        )}
      </div>
      <ChatInput conversationId={conversationId} sendTypingStart={sendTypingStart} sendTypingStop={sendTypingStop} canSend={true} />

      {showSearch && <SearchChat conversationId={conversationId} onClose={() => setShowSearch(false)} />}
    </div>
  );
}
