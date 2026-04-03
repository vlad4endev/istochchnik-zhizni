import { useEffect, useRef, useMemo, useCallback, useState, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore, EMPTY_ARRAY, isDraftPrivateConversationId } from '../chatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SearchChat } from './SearchChat';
import { LuArrowLeft, LuSearch } from 'react-icons/lu';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
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
  const isDraft = isDraftPrivateConversationId(conversationId);
  const messages = useChatStore((s) => s.messagesByConv[conversationId] || EMPTY_ARRAY);
  const loading = useChatStore((s) => s.messagesLoading[conversationId] || false);
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? true);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const markReadUpTo = useChatStore((s) => s.markReadUpTo);
  const markAsRead = useChatStore((s) => s.markAsRead);
  const conversations = useChatStore((s) => s.conversations);
  const draftPeer = useChatStore((s) => s.privateDraftPeer);
  const typingUsers = useChatStore((s) => s.typingByConv[conversationId] || EMPTY_ARRAY);
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const currentMemberId = useChatStore((s) => s.currentMemberId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const nodeByMsgIdRef = useRef<Map<string, HTMLElement>>(new Map());
  const lastSentReadIdRef = useRef<bigint>(0n);
  const visibleForeignIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);

  const conv = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);

  useEffect(() => {
    nearBottomRef.current = true;
    restoreScrollRef.current = null;
    if (!isDraft) {
      void loadMessages(conversationId);
    }
  }, [conversationId, loadMessages]);

  // On open: mark chat as read (server cursor + local unread reset)
  useEffect(() => {
    if (!isDraft) {
      void markAsRead(conversationId);
    }
  }, [conversationId, markAsRead]);

  const flushVisibleReads = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(() => {
      const ids = Array.from(visibleForeignIdsRef.current);
      let max: bigint = 0n;
      for (const id of ids) {
        if (!/^\d+$/.test(id)) continue;
        const b = BigInt(id);
        if (b > max) max = b;
      }
      if (max > lastSentReadIdRef.current) {
        lastSentReadIdRef.current = max;
        void markReadUpTo(conversationId, String(max));
      }
    }, 120);
  }, [conversationId, markReadUpTo]);

  const jumpToMessage = useCallback((messageId: string) => {
    const id = String(messageId || '').trim();
    if (!/^\d+$/.test(id)) return;
    const el = nodeByMsgIdRef.current.get(id) ?? null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('msg-jump-highlight');
    // next frame ensures animation restarts
    requestAnimationFrame(() => {
      el.classList.add('msg-jump-highlight');
      window.setTimeout(() => el.classList.remove('msg-jump-highlight'), 900);
    });
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    if (isDraft) return;
    if (typeof IntersectionObserver === 'undefined') return;

    visibleForeignIdsRef.current.clear();
    lastSentReadIdRef.current = 0n;

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const msgId = el.dataset.msgId || '';
          if (!msgId) continue;
          if (entry.isIntersecting) {
            if (!visibleForeignIdsRef.current.has(msgId)) {
              visibleForeignIdsRef.current.add(msgId);
              changed = true;
            }
          } else {
            if (visibleForeignIdsRef.current.delete(msgId)) {
              changed = true;
            }
          }
        }
        if (changed) flushVisibleReads();
      },
      {
        root,
        threshold: 0.6,
      },
    );

    // Observe current nodes
    for (const [, node] of nodeByMsgIdRef.current) {
      observer.observe(node);
    }

    return () => {
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      observer.disconnect();
    };
  }, [conversationId, currentMemberId, flushVisibleReads, isDraft]);

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
    if (isDraft && draftPeer) {
      const fn = draftPeer.first_name || '';
      const ln = draftPeer.last_name || '';
      return `${fn} ${ln}`.trim() || draftPeer.name || 'Чат';
    }
    if (!conv) return 'Чат';
    if (conv.type === 'private' && conv.other_member) {
      const fn = conv.other_member.first_name || '';
      const ln = conv.other_member.last_name || '';
      return `${fn} ${ln}`.trim() || conv.other_member.name;
    }
    return conv.title || 'Чат';
  }, [conv, draftPeer, isDraft]);

  const headerInitial = displayName.trim().charAt(0).toUpperCase() || '?';
  const headerAvatarUrl = isDraft
    ? (draftPeer?.avatar_url ?? null)
    : conv?.type === 'private'
      ? (conv.other_member?.avatar_url ?? null)
      : (conv?.avatar_url ?? null);
  const headerAvatarSrc = useMemo(() => resolvePublicUrl(headerAvatarUrl), [headerAvatarUrl]);
  const headerAvatarColor = useMemo(() => {
    if (isDraft && draftPeer) return 'var(--tg-primary)';
    if (!conv?.id) return 'var(--tg-primary)';
    let hash = 0;
    for (let i = 0; i < conv.id.length; i++) {
      hash = conv.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palette = ['#7d3640', '#0d9488', '#6366f1', '#c2410c', '#4f46e5', '#0e7490'];
    return palette[Math.abs(hash) % palette.length];
  }, [conv?.id, draftPeer, isDraft]);

  const isOnline = conv?.type === 'private' && conv.other_member && onlineMembers.has(conv.other_member.id);

  const headerSubtitle = useMemo(() => {
    if (typingUsers.length > 0) {
      return `${typingUsers.map((u: { memberName: string }) => u.memberName.split(' ')[0]).join(', ')} печатает…`;
    }
    if (isDraft) return 'черновик · чат появится после 1 сообщения';
    if (!conv) return '';
    if (conv.type === 'private' && conv.other_member) {
      return isOnline ? 'в сети' : 'был(а) недавно';
    }
    return conv.type === 'channel' ? 'канал' : 'группа';
  }, [conv, typingUsers, isOnline, isDraft]);

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
    <div className="tg-chat-window box-border flex w-full max-w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-gray-50">
      {/* Safe-area только на корне (.tg-chat-window) в messenger.css для iOS — не дублировать здесь */}
      <header className="sticky top-0 z-[100] w-full shrink-0 border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex h-14 w-full min-w-0 items-center justify-between gap-1.5 px-2 py-2 sm:h-16 sm:gap-3 sm:px-4 md:px-6">
          <button
            type="button"
            onClick={onBack}
            aria-label="Назад к списку чатов"
            className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition-colors duration-200 hover:bg-stone-100 active:scale-[0.98]"
          >
            <LuArrowLeft size={22} strokeWidth={2.25} />
          </button>

          {/* Middle: Main info (Avatar + Name & Subtitle) - Stricly capped via flex-1 min-w-0 */}
          <div
            role={isDraft ? undefined : 'button'}
            tabIndex={isDraft ? -1 : 0}
            onClick={isDraft ? undefined : () => navigate(`/messenger/chat/${conversationId}/manage`)}
            onKeyDown={isDraft ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/messenger/chat/${conversationId}/manage`); }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-1.5 py-1 text-left transition-colors duration-200 hover:bg-stone-50 active:scale-[0.99] sm:gap-3 sm:px-3"
          >
            <div
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white sm:h-10 sm:w-10"
              style={{
                backgroundColor: headerAvatarColor,
                fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
              }}
            >
              {headerAvatarSrc ? (
                <img src={headerAvatarSrc} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span>{headerInitial}</span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="w-full truncate text-[15px] font-semibold leading-tight text-stone-900 sm:text-[17px]">
                {displayName}
              </div>
              <div
                className={[
                  'w-full truncate text-[11px] leading-tight sm:text-xs',
                  typingUsers.length > 0 ? 'text-primary font-medium' : 'text-stone-500',
                ].join(' ')}
              >
                {headerSubtitle}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => navigate(`/messenger/chat/${conversationId}/manage`)}
              aria-label="Управление чатом"
              title="Управление"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition-colors duration-200 hover:bg-stone-100 active:scale-[0.98]"
            >
              <span className="text-lg font-black leading-none" aria-hidden>⋮</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              aria-label="Поиск по сообщениям"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition-colors duration-200 hover:bg-stone-100 active:scale-[0.98]"
            >
              <LuSearch size={20} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-slate-50 px-3 py-3 sm:gap-3 sm:p-4"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {hasMore ? (
          <div className="flex justify-center">
            <div className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-stone-500 shadow-sm ring-1 ring-stone-200/60">
              {loading ? 'Загрузка истории…' : '↑ Ранние сообщения'}
            </div>
          </div>
        ) : null}

        {messages.length === 0 && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <p className="text-base font-semibold text-stone-900">Пока тихо</p>
            <p className="mt-1 max-w-xs text-sm text-stone-500">
              Напишите первое сообщение — оно появится здесь.
            </p>
          </div>
        ) : (
          groupedMessages.map((msg) => (
            <div key={msg.id} className="flex flex-col gap-3">
              {msg.showDate ? (
                <div className="flex justify-center">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-stone-600 shadow-sm ring-1 ring-stone-200/60">
                    {msg.dateLabel}
                  </span>
                </div>
              ) : null}
              <div
                ref={(node) => {
                  const map = nodeByMsgIdRef.current;
                  if (!/^\d+$/.test(String(msg.id))) return;
                  if (node) {
                    map.set(String(msg.id), node);
                    node.dataset.msgId = String(msg.id);
                  } else {
                    map.delete(String(msg.id));
                  }
                }}
              >
                <MessageBubble
                  message={msg}
                  isGroupedPrev={msg.isGroupedPrev}
                  isGroupedNext={msg.isGroupedNext}
                  onJumpToMessage={jumpToMessage}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sticky bottom-0 z-20 w-full min-w-0 max-w-full shrink-0 border-t bg-white p-3">
        <ChatInput
          conversationId={conversationId}
          sendTypingStart={sendTypingStart}
          sendTypingStop={sendTypingStop}
          canSend={true}
        />
      </div>

      {showSearch ? (
        <SearchChat conversationId={conversationId} onClose={() => setShowSearch(false)} />
      ) : null}
    </div>
  );
}
