import { useEffect, useRef, useMemo, useCallback, useState, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore, EMPTY_ARRAY } from '../chatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SearchChat } from './SearchChat';
import { LuArrowLeft, LuSearch } from 'react-icons/lu';
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
  const navigate = useNavigate();
  const messages = useChatStore((s) => s.messagesByConv[conversationId] || EMPTY_ARRAY);
  const loading = useChatStore((s) => s.messagesLoading[conversationId] || false);
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? true);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const markRead = useChatStore((s) => s.markRead);
  const conversations = useChatStore((s) => s.conversations);
  const typingUsers = useChatStore((s) => s.typingByConv[conversationId] || EMPTY_ARRAY);
  const onlineMembers = useChatStore((s) => s.onlineMembers);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const conv = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);

  useEffect(() => {
    nearBottomRef.current = true;
    restoreScrollRef.current = null;
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      void markRead(conversationId);
    }
  }, [conversationId, messages.length, markRead]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pad = 140;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < pad;

    if (el.scrollTop < 72 && hasMore && !loading && !restoreScrollRef.current) {
      restoreScrollRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      void loadMessages(conversationId, true);
    }
  }, [conversationId, hasMore, loading, loadMessages]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const restore = restoreScrollRef.current;
    if (restore) {
      restoreScrollRef.current = null;
      const nextHeight = el.scrollHeight;
      el.scrollTop = nextHeight - restore.scrollHeight + restore.scrollTop;
      return;
    }

    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, conversationId]);

  const displayName = useMemo(() => {
    if (!conv) return 'Чат';
    if (conv.type === 'private' && conv.other_member) {
      const fn = conv.other_member.first_name || '';
      const ln = conv.other_member.last_name || '';
      return `${fn} ${ln}`.trim() || conv.other_member.name;
    }
    return conv.title || 'Чат';
  }, [conv]);

  const headerInitial = displayName.trim().charAt(0).toUpperCase() || '?';
  const headerAvatarUrl =
    conv?.type === 'private'
      ? (conv.other_member?.avatar_url ?? null)
      : (conv?.avatar_url ?? null);
  const headerAvatarColor = useMemo(() => {
    if (!conv?.id) return 'var(--tg-primary)';
    let hash = 0;
    for (let i = 0; i < conv.id.length; i++) {
      hash = conv.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palette = ['#7d3640', '#0d9488', '#6366f1', '#c2410c', '#4f46e5', '#0e7490'];
    return palette[Math.abs(hash) % palette.length];
  }, [conv?.id]);

  const isOnline = conv?.type === 'private' && conv.other_member && onlineMembers.has(conv.other_member.id);

  const headerSubtitle = useMemo(() => {
    if (typingUsers.length > 0) {
      return `${typingUsers.map((u: { memberName: string }) => u.memberName.split(' ')[0]).join(', ')} печатает…`;
    }
    if (!conv) return '';
    if (conv.type === 'private' && conv.other_member) {
      return isOnline ? 'в сети' : 'был(а) недавно';
    }
    return conv.type === 'channel' ? 'канал' : 'группа';
  }, [conv, typingUsers, isOnline]);

  const groupedMessages = useMemo(() => {
    return messages.map((msg, idx) => {
      const prev = messages[idx - 1];
      const next = messages[idx + 1];
      const isGroupedPrev =
        !!prev &&
        prev.sender_id === msg.sender_id &&
        new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 300000;
      const isGroupedNext =
        !!next &&
        next.sender_id === msg.sender_id &&
        new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() < 300000;
      const msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const prevDate = prev ? new Date(prev.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : null;
      return {
        ...msg,
        isGroupedPrev,
        isGroupedNext,
        showDate: msgDate !== prevDate,
        dateLabel: msgDate,
      };
    });
  }, [messages]);

  return (
    <div className="tg-chat-window">
      <header className="tg-header">
        <button type="button" className="tg-icon-btn tg-header-back" onClick={onBack} aria-label="Назад к списку чатов">
          <LuArrowLeft size={22} strokeWidth={2.25} />
        </button>
        <div className="tg-header-avatar" style={{ background: headerAvatarColor }} aria-hidden>
          {headerAvatarUrl ? (
            <img
              src={headerAvatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
              loading="lazy"
            />
          ) : (
            headerInitial
          )}
        </div>
        <div className="tg-header-info">
          <div className="tg-header-name">{displayName}</div>
          <div className={`tg-header-status ${typingUsers.length > 0 ? 'tg-header-status--typing' : ''}`} aria-live="polite">
            {headerSubtitle}
          </div>
        </div>
        <div className="tg-header-actions">
          <button
            type="button"
            className="tg-icon-btn"
            onClick={() => navigate(`/messenger/chat/${conversationId}/manage`)}
            aria-label="Управление чатом"
            title="Управление"
          >
            <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
              ⋮
            </span>
          </button>
          <button
            type="button"
            className="tg-icon-btn"
            onClick={() => setShowSearch(true)}
            aria-label="Поиск по сообщениям"
          >
            <LuSearch size={20} strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <div
        className="tg-messages tg-messages--native"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {hasMore && (
          <div className="tg-load-older">
            {loading ? <span className="tg-load-older-text">Загрузка истории…</span> : <span className="tg-load-older-hint">↑ Ранние сообщения</span>}
          </div>
        )}
        {messages.length === 0 && !loading ? (
          <div className="tg-empty-chat">
            <p className="tg-empty-chat-title">Пока тихо</p>
            <p className="tg-empty-chat-sub">Напишите первое сообщение — оно появится здесь.</p>
          </div>
        ) : (
          groupedMessages.map((msg) => (
            <div key={msg.id} className="tg-msg-row">
              {msg.showDate ? (
                <div className="tg-date-divider">
                  <span>{msg.dateLabel}</span>
                </div>
              ) : null}
              <MessageBubble message={msg} isGroupedPrev={msg.isGroupedPrev} isGroupedNext={msg.isGroupedNext} />
            </div>
          ))
        )}
      </div>
      <ChatInput conversationId={conversationId} sendTypingStart={sendTypingStart} sendTypingStop={sendTypingStop} canSend={true} />

      {showSearch ? <SearchChat conversationId={conversationId} onClose={() => setShowSearch(false)} /> : null}
    </div>
  );
}
