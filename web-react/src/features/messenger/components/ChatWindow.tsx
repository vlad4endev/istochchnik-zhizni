import { useEffect, useRef, useMemo, useCallback, useState, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { useChatStore, EMPTY_ARRAY, isDraftPrivateConversationId } from '../chatStore';
import * as api from '../api/messengerApi';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SearchChat } from './SearchChat';
import { LuArrowLeft, LuLayers, LuSearch } from 'react-icons/lu';
import { AppAvatar } from '../../../components/AppAvatar';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { ChatMediaGallery } from './ChatMediaGallery';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { groupMessages } from '../groupMessages';
import { getAvatarColor, getAvatarInitial } from '../avatarUtils';
import './messenger.css';

/** Склонение «N участников» по-русски (как в интерфейсах мессенджеров). */
function formatParticipantCountRU(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} участников`;
  if (mod10 === 1) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} участника`;
  return `${n} участников`;
}

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
  const memberLastSeenAt = useChatStore((s) => s.memberLastSeenAt);
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const pinnedBump = useChatStore((s) => s.pinnedBumpByConv[conversationId] ?? 0);

  const [chatMeta, setChatMeta] = useState<api.ConversationMeta | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<api.MessageWithSender[]>([]);
  const [mentionList, setMentionList] = useState<{ id: number; label: string }[]>([]);
  /** Все member_id в группе/канале — для подзаголовка «N в сети» (как в Telegram). */
  const [groupParticipantIds, setGroupParticipantIds] = useState<number[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const nodeByMsgIdRef = useRef<Map<string, HTMLElement>>(new Map());
  const autoJumpUnreadKeyRef = useRef<string | null>(null);
  const lastSentReadIdRef = useRef<bigint>(0n);
  const visibleForeignIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);
  const markReadInFlightRef = useRef<bigint>(0n);
  const markReadCommittedRef = useRef<bigint>(0n);
  const scrollMeasureRafRef = useRef<number | null>(null);
  const readObserverRef = useRef<IntersectionObserver | null>(null);

  const conv = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);

  useEffect(() => {
    if (isDraft) {
      setChatMeta(null);
      setPinnedMessages([]);
      setMentionList([]);
      setGroupParticipantIds([]);
      return;
    }
    let alive = true;
    void api.fetchConversationMeta(conversationId).then((m) => {
      if (alive) setChatMeta(m);
    }).catch(() => {
      if (alive) setChatMeta(null);
    });
    if (conv && conv.type !== 'private') {
      void api.fetchPinnedMessages(conversationId).then((pins) => {
        if (alive) setPinnedMessages(pins);
      }).catch(() => {
        if (alive) setPinnedMessages([]);
      });
      void api.fetchParticipants(conversationId).then((parts) => {
        if (!alive) return;
        const me = useChatStore.getState().currentMemberId;
        setGroupParticipantIds(parts.map((p) => p.member_id));
        setMentionList(
          parts
            .filter((p) => me == null || p.member_id !== me)
            .map((p) => ({
              id: p.member_id,
              label:
                (p.first_name ? `${p.first_name} ${p.last_name ?? ''}`.trim() : p.name) ||
                `Участник ${p.member_id}`,
            })),
        );
      }).catch(() => {
        if (alive) {
          setMentionList([]);
          setGroupParticipantIds([]);
        }
      });
    } else {
      setPinnedMessages([]);
      setMentionList([]);
      setGroupParticipantIds([]);
    }
    return () => {
      alive = false;
    };
  }, [conversationId, isDraft, conv?.type, pinnedBump]);

  const participantLabelById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const p of mentionList) {
      m[p.id] = p.label;
    }
    return m;
  }, [mentionList]);

  const canPostMessages = isDraft || chatMeta?.my_effective_permissions?.can_send_messages !== false;
  const canPinMessages = chatMeta?.my_effective_permissions?.can_pin_messages === true;

  const handlePinToggle = useCallback(
    async (messageId: string, nextPinned: boolean) => {
      try {
        if (nextPinned) {
          await api.pinChatMessage(conversationId, messageId);
        } else {
          await api.unpinChatMessage(conversationId, messageId);
        }
        const pins = await api.fetchPinnedMessages(conversationId);
        setPinnedMessages(pins);
        useChatStore.setState((s) => ({
          messagesByConv: {
            ...s.messagesByConv,
            [conversationId]: (s.messagesByConv[conversationId] || []).map((msg) =>
              String(msg.id) === String(messageId) ? { ...msg, is_pinned: nextPinned } : msg,
            ),
          },
        }));
      } catch {
        /* ignore */
      }
    },
    [conversationId],
  );

  useEffect(() => {
    nearBottomRef.current = true;
    restoreScrollRef.current = null;
    if (!isDraft) {
      // При открытии чата всегда подтягиваем первую страницу (как в Telegram), без антидребезга 1.5s.
      void loadMessages(conversationId, false, { force: true });
    }
  }, [conversationId, loadMessages]);

  // On open: mark read; если есть непрочитанное — чуть откладываем, чтобы успел сработать автоскролл к первому непрочитанному.
  useEffect(() => {
    if (isDraft) return;
    const unread = conversations.find((c) => c.id === conversationId)?.unread_count ?? 0;
    const delay = unread > 0 ? 700 : 0;
    const t = window.setTimeout(() => {
      void markAsRead(conversationId);
    }, delay);
    return () => window.clearTimeout(t);
  }, [conversationId, markAsRead, isDraft, conversations]);

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
      if (max > lastSentReadIdRef.current && max > markReadInFlightRef.current && max > markReadCommittedRef.current) {
        lastSentReadIdRef.current = max;
        markReadInFlightRef.current = max;
        void markReadUpTo(conversationId, String(max))
          .then(() => {
            if (markReadCommittedRef.current < max) {
              markReadCommittedRef.current = max;
            }
          })
          .finally(() => {
            if (markReadInFlightRef.current === max) {
              markReadInFlightRef.current = 0n;
            }
          });
      }
    }, 350);
  }, [conversationId, markReadUpTo]);

  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);

  const listCount = groupedMessages.length;
  const rowVirtualizer = useVirtualizer({
    count: listCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = groupedMessages[index];
      if (!row) return 80;
      return row.showDate ? 100 : 76;
    },
    overscan: 12,
    gap: 10,
    getItemKey: (index) => {
      const row = groupedMessages[index];
      return row ? String(row.id) : index;
    },
  });

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const id = String(messageId || '').trim();
      if (!/^\d+$/.test(id)) return;
      const idx = groupedMessages.findIndex((m) => String(m.id) === id);
      if (idx >= 0) {
        rowVirtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
      }
      const highlight = () => {
        const el = nodeByMsgIdRef.current.get(id) ?? null;
        if (!el) return false;
        el.classList.remove('msg-jump-highlight');
        requestAnimationFrame(() => {
          el.classList.add('msg-jump-highlight');
          window.setTimeout(() => el.classList.remove('msg-jump-highlight'), 900);
        });
        return true;
      };
      requestAnimationFrame(() => {
        if (highlight()) return;
        window.setTimeout(() => {
          highlight();
        }, 450);
      });
    },
    [groupedMessages, rowVirtualizer],
  );

  useEffect(() => {
    autoJumpUnreadKeyRef.current = null;
  }, [conversationId]);

  const firstUnreadMessageId = useMemo(() => {
    if (isDraft || currentMemberId == null || chatMeta == null) return null;
    const lr = chatMeta.my_last_read_message_id;
    let base = 0n;
    if (lr && /^\d+$/.test(lr)) {
      try {
        base = BigInt(lr);
      } catch {
        base = 0n;
      }
    }
    for (const m of messages) {
      const id = String(m.id);
      if (!/^\d+$/.test(id)) continue;
      if (m.sender_id != null && Number(m.sender_id) === Number(currentMemberId)) continue;
      try {
        if (BigInt(id) > base) return id;
      } catch {
        continue;
      }
    }
    return null;
  }, [messages, chatMeta, currentMemberId, isDraft]);

  const mediaItems = useMemo(() => {
    const out: { messageId: string; src: string }[] = [];
    for (const m of messages) {
      if (m.is_deleted || m.payload_type !== 'image') continue;
      const raw = String((m.payload as { url?: string }).url ?? '').trim();
      const src = resolvePublicUrl(raw) ?? raw;
      if (src) out.push({ messageId: String(m.id), src });
    }
    return out;
  }, [messages]);

  useLayoutEffect(() => {
    if (isDraft || chatMeta == null) return;
    const unread = conv?.unread_count ?? 0;
    if (unread <= 0 || !firstUnreadMessageId) return;
    if (messages.length === 0) return;
    const key = `${conversationId}:${firstUnreadMessageId}`;
    if (autoJumpUnreadKeyRef.current === key) return;
    autoJumpUnreadKeyRef.current = key;
    jumpToMessage(firstUnreadMessageId);
  }, [isDraft, chatMeta, conversationId, conv?.unread_count, firstUnreadMessageId, messages.length, jumpToMessage]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    if (isDraft) return;
    if (typeof IntersectionObserver === 'undefined') return;

    visibleForeignIdsRef.current.clear();
    lastSentReadIdRef.current = 0n;
    markReadInFlightRef.current = 0n;
    markReadCommittedRef.current = 0n;

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

    readObserverRef.current = observer;

    for (const [, node] of nodeByMsgIdRef.current) {
      observer.observe(node);
    }

    return () => {
      readObserverRef.current = null;
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      observer.disconnect();
    };
  }, [conversationId, currentMemberId, flushVisibleReads, isDraft]);

  const handleScroll = useCallback(() => {
    if (scrollMeasureRafRef.current != null) return;
    scrollMeasureRafRef.current = requestAnimationFrame(() => {
      scrollMeasureRafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const pad = 140;
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < pad;

      if (el.scrollTop < 72 && hasMore && !loading && !restoreScrollRef.current) {
        restoreScrollRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
        void loadMessages(conversationId, true);
      }
    });
  }, [conversationId, hasMore, loading, loadMessages]);

  useEffect(() => {
    return () => {
      if (scrollMeasureRafRef.current != null) {
        cancelAnimationFrame(scrollMeasureRafRef.current);
        scrollMeasureRafRef.current = null;
      }
    };
  }, []);

  const virtualListTotalSize = rowVirtualizer.getTotalSize();

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

    if (nearBottomRef.current && listCount > 0) {
      rowVirtualizer.scrollToIndex(listCount - 1, { align: 'end', behavior: 'auto' });
      return;
    }

    if (nearBottomRef.current && listCount === 0) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, conversationId, listCount, virtualListTotalSize, rowVirtualizer]);

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

  const headerInitial = getAvatarInitial(displayName);
  const headerAvatarUrl = isDraft
    ? (draftPeer?.avatar_url ?? null)
    : conv?.type === 'private'
      ? (conv.other_member?.avatar_url ?? null)
      : (conv?.avatar_url ?? null);
  const headerAvatarColor = useMemo(() => {
    if (isDraft && draftPeer) return 'var(--tg-primary)';
    if (!conv?.id) return 'var(--tg-primary)';
    return getAvatarColor(conv.id);
  }, [conv?.id, draftPeer, isDraft]);

  const isOnline = conv?.type === 'private' && conv.other_member && onlineMembers.has(conv.other_member.id);

  const onlineInGroupCount = useMemo(() => {
    if (groupParticipantIds.length === 0) return 0;
    return groupParticipantIds.filter((id) => onlineMembers.has(id)).length;
  }, [groupParticipantIds, onlineMembers]);

  const headerSubtitle = useMemo(() => {
    if (typingUsers.length > 0) {
      return `${typingUsers.map((u: { memberName: string }) => u.memberName.split(' ')[0]).join(', ')} печатает…`;
    }
    if (isDraft) return 'черновик · чат появится после 1 сообщения';
    if (!conv) return '';
    if (conv.type === 'private' && conv.other_member) {
      if (isOnline) return 'в сети';
      const pid = conv.other_member.id;
      const iso = memberLastSeenAt[pid] ?? conv.other_member.last_seen_at ?? null;
      return formatMessengerLastSeen(iso);
    }
    if (conv.type === 'group' || conv.type === 'channel') {
      const n = groupParticipantIds.length;
      if (n > 0 && onlineInGroupCount > 0) {
        const onWord = `${onlineInGroupCount} в сети`;
        return `${onWord} · ${formatParticipantCountRU(n)}`;
      }
      if (n > 0) {
        return formatParticipantCountRU(n);
      }
      return conv.type === 'channel' ? 'канал' : 'группа';
    }
    return 'чат';
  }, [
    conv,
    typingUsers,
    isOnline,
    isDraft,
    memberLastSeenAt,
    groupParticipantIds.length,
    onlineInGroupCount,
  ]);

  const headerStatusClass =
    typingUsers.length > 0
      ? 'font-medium text-primary'
      : isDraft || (conv && conv.type !== 'private')
        ? 'text-gray-500'
        : 'text-blue-500';

  /** Публичная «Моя страница» собеседника: `/profile/member-:id` (как в API профиля). */
  const interlocutorProfilePath = useMemo(() => {
    if (isDraft && draftPeer) {
      return `/profile/member-${draftPeer.id}`;
    }
    if (conv?.type === 'private' && conv.other_member) {
      return `/profile/member-${conv.other_member.id}`;
    }
    return null;
  }, [isDraft, draftPeer, conv]);

  const onHeaderInfoClick = useCallback(() => {
    if (interlocutorProfilePath) {
      navigate(interlocutorProfilePath);
      return;
    }
    navigate(`/messenger/chat/${conversationId}/manage`);
  }, [interlocutorProfilePath, navigate, conversationId]);

  const headerInfoAriaLabel =
    interlocutorProfilePath != null ? 'Открыть страницу собеседника' : 'Сведения о чате';

  return (
    <div className="tg-chat-window box-border flex w-full max-w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {/* Safe-area только на корне (.tg-chat-window) в messenger.css для iOS — не дублировать здесь */}
      <header className="sticky top-0 z-[100] w-full min-w-0 shrink-0 border-b border-gray-200/60 bg-white">
        <div className="mx-auto flex min-h-[52px] w-full min-w-0 max-w-full items-center gap-1 px-1 py-1.5 sm:gap-2 sm:px-2 sm:py-2">
          {/* Слева: «Назад» (как в Telegram / iOS). */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад к списку чатов"
              className="flex max-w-[min(7rem,28vw)] items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-1 text-[17px] leading-none text-blue-500 transition-colors active:bg-gray-100 sm:max-w-[7.5rem] sm:pl-1.5 sm:pr-2"
            >
              <LuArrowLeft className="h-[22px] w-[22px] shrink-0" strokeWidth={2.2} aria-hidden />
              <span className="truncate font-normal">Назад</span>
            </button>
          </div>

          {/* Рядом с «Назад»: аватар + имя/статус в одну линию по горизонтали (как в Telegram). */}
          <div
            role="button"
            tabIndex={0}
            onClick={onHeaderInfoClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onHeaderInfoClick();
              }
            }}
            aria-label={headerInfoAriaLabel}
            title={interlocutorProfilePath != null ? 'Открыть страницу пользователя' : undefined}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg py-0.5 pl-0.5 pr-1 text-left transition-colors active:bg-gray-100/80 sm:gap-3 sm:pr-2"
          >
            <div
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[13px] font-semibold text-white sm:h-10 sm:w-10"
              style={{ backgroundColor: headerAvatarColor }}
            >
              <AppAvatar
                src={headerAvatarUrl}
                fallback={<span>{headerInitial}</span>}
                priority
                className="grid h-full w-full place-items-center"
                imgClassName="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate text-[16px] font-semibold leading-[1.2] text-gray-900 sm:text-[17px]">{displayName}</div>
              {headerSubtitle ? (
                <div className={['truncate text-xs leading-tight sm:text-[13px]', headerStatusClass].join(' ')}>
                  {headerSubtitle}
                </div>
              ) : null}
            </div>
          </div>

          {/* Справа: действия */}
          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1">
            {!isDraft && firstUnreadMessageId && (conv?.unread_count ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => firstUnreadMessageId && jumpToMessage(firstUnreadMessageId)}
                aria-label="К первому непрочитанному"
                title="К непрочитанным"
                className="inline-flex h-10 min-w-[2rem] items-center justify-center rounded-full px-1.5 text-[13px] font-extrabold text-primary transition-colors hover:bg-primary/10 active:bg-primary/15"
              >
                ↓
              </button>
            ) : null}
            {!isDraft && mediaItems.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowMediaGallery(true)}
                aria-label="Медиа в этом чате"
                title="Медиа"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100"
              >
                <LuLayers size={20} strokeWidth={2.25} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(`/messenger/chat/${conversationId}/manage`)}
              aria-label="Управление чатом"
              title="Управление"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100"
            >
              <span className="text-lg font-black leading-none" aria-hidden>
                ⋮
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              aria-label="Поиск по сообщениям"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100"
            >
              <LuSearch size={20} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </header>

      {!isDraft && pinnedMessages.length > 0 ? (
        <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/90 px-3 py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900/80">Закреплено</p>
          <div className="mt-1 space-y-1">
            {pinnedMessages.map((pm) => (
              <button
                key={pm.id}
                type="button"
                onClick={() => jumpToMessage(String(pm.id))}
                className="block w-full truncate rounded-lg px-2 py-1 text-left text-[13px] font-semibold text-stone-800 transition hover:bg-amber-100/80"
              >
                {String(pm.content || '').trim().slice(0, 100) || 'Сообщение'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-transparent px-3 py-3 sm:gap-3 sm:p-4"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {hasMore ? (
          <div className="flex justify-center">
            <div className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-stone-600 shadow-sm ring-1 ring-stone-200/50">
              {loading ? 'Загрузка истории…' : '↑ Ранние сообщения'}
            </div>
          </div>
        ) : null}

        {messages.length === 0 && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <p className="text-base font-semibold text-stone-900">Пока тихо</p>
            <p className="mt-1 max-w-xs text-sm text-stone-500">
              {conv && conv.type !== 'private'
                ? 'Напишите первое сообщение в этой беседе — его увидят все участники.'
                : 'Напишите первое сообщение — оно появится здесь.'}
            </p>
          </div>
        ) : (
          <div
            key={conversationId}
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const msg = groupedMessages[virtualRow.index];
              if (!msg) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="left-0 top-0 w-full"
                  style={{
                    position: 'absolute',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex flex-col gap-3">
                    {msg.showDate ? (
                      <div className="flex justify-center">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-stone-600 shadow-sm ring-1 ring-stone-200/50">
                          {msg.dateLabel}
                        </span>
                      </div>
                    ) : null}
                    <div
                      ref={(node) => {
                        const map = nodeByMsgIdRef.current;
                        const obs = readObserverRef.current;
                        const idStr = String(msg.id);
                        if (!/^\d+$/.test(idStr)) return;
                        const prev = map.get(idStr) ?? null;
                        if (prev && obs) {
                          try {
                            obs.unobserve(prev);
                          } catch {
                            /* ignore */
                          }
                        }
                        if (node) {
                          map.set(idStr, node);
                          node.dataset.msgId = idStr;
                          if (obs) obs.observe(node);
                        } else {
                          map.delete(idStr);
                        }
                      }}
                    >
                      <MessageBubble
                        message={msg}
                        isGroupedPrev={msg.isGroupedPrev}
                        isGroupedNext={msg.isGroupedNext}
                        onJumpToMessage={jumpToMessage}
                        participantLabelById={participantLabelById}
                        canPinMessages={canPinMessages}
                        onPinToggle={handlePinToggle}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 w-full min-w-0 max-w-full shrink-0 border-t bg-white p-3">
        <ChatInput
          conversationId={conversationId}
          sendTypingStart={sendTypingStart}
          sendTypingStop={sendTypingStop}
          canSend={canPostMessages}
          mentionParticipants={conv && conv.type !== 'private' ? mentionList : []}
          participantLabelById={participantLabelById}
        />
      </div>

      {showSearch ? (
        <SearchChat conversationId={conversationId} onClose={() => setShowSearch(false)} />
      ) : null}

      {!isDraft ? (
        <ChatMediaGallery
          open={showMediaGallery}
          onClose={() => setShowMediaGallery(false)}
          items={mediaItems}
          onOpenMessage={(id) => jumpToMessage(id)}
        />
      ) : null}
    </div>
  );
}
