import { useEffect, useRef, useMemo, useCallback, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { useChatStore, EMPTY_ARRAY, isDraftPrivateConversationId } from '../chatStore';
import { isMessengerChatReadSurfaceOpen } from '../messengerReadSurface';
import * as api from '../api/messengerApi';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SearchChat } from './SearchChat';
import { LuArrowLeft, LuLayers, LuPhone, LuSearch, LuVideo } from 'react-icons/lu';
import { AppAvatar } from '../../../components/AppAvatar';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { ChatMediaGallery } from './ChatMediaGallery';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { groupMessages } from '../groupMessages';
import { getAlbumImageUrl, getPrimaryAttachmentUrl, inferMessengerPayloadType } from '../payloadMedia';
import { getAvatarColor, getAvatarInitial } from '../avatarUtils';
import { isAccessRequestsMessengerChannel } from '../messengerChannelKinds';
import { isAppAdministratorRole } from '../manage/messengerManageAccess';
import { useCallStore } from '../../calls/callStore';
import { requestCallNotificationsFromUserGesture } from '../../calls/incomingCallBackground';
import { sendRealtimeJson } from '../../../lib/realtimeWsClient';
import { emitAppToast } from '../../../lib/uiFeedback';
import './messenger.css';

const CALLS_FEATURE_ENABLED = import.meta.env.VITE_CALLS_ENABLED === 'true';

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
  const chatScrollStorageKey = `messenger:chat-window-scroll:${conversationId}`;
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
  /** Готовность "пакета" данных шапки/инпута для предотвращения визуального дёргания на мобиле. */
  const [chatHeadReady, setChatHeadReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredChatScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  /** Плашка «к новым», если лента уехала вверх и пришло чужое сообщение. */
  const [showNewBelow, setShowNewBelow] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  /** Меню звонка в шапке (аудио / видео). */
  const [callHeaderMenuOpen, setCallHeaderMenuOpen] = useState(false);
  const callHeaderMenuRef = useRef<HTMLDivElement>(null);
  const nodeByMsgIdRef = useRef<Map<string, HTMLElement>>(new Map());
  const autoJumpUnreadKeyRef = useRef<string | null>(null);
  const lastSentReadIdRef = useRef<bigint>(0n);
  const visibleForeignIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);
  const markAsReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadInFlightRef = useRef<bigint>(0n);
  const markReadCommittedRef = useRef<bigint>(0n);
  const scrollMeasureRafRef = useRef<number | null>(null);
  const readObserverRef = useRef<IntersectionObserver | null>(null);
  /** Последний известный id хвоста ленты — для кнопки «Новые» при входящих вне низа. */
  const lastTailIdSeenRef = useRef<string | null>(null);

  /**
   * A11y-announcer'ы (sr-only live regions) — три независимых буфера.
   *
   * Почему отдельные, а НЕ `aria-live` на виртуализированном списке:
   *   - `@tanstack/react-virtual` добавляет/удаляет DOM-узлы при прокрутке, и
   *     `aria-live` на контейнере = SR зачитывает историю при каждом скролле;
   *   - разведение по регионам даёт разный приоритет и предотвращает
   *     «склеивание» (например, «печатает» + одновременно приходит сообщение
   *     в одном буфере = SR режет речь).
   */
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState('');
  const [presenceAnnouncement, setPresenceAnnouncement] = useState('');
  /** id последнего уже озвученного «хвоста» (защита от повторов + игнор истории). */
  const lastAnnouncedTailIdRef = useRef<string | null>(null);
  /** предыдущее значение online для других-в-личке, чтобы озвучивать только переходы. */
  const prevIsOnlineRef = useRef<boolean | null>(null);

  const conv = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);

  const isAccessRequestsChannel = useMemo(
    () => isAccessRequestsMessengerChannel(chatMeta?.metadata ?? conv?.metadata),
    [chatMeta?.metadata, conv?.metadata],
  );

  /** Пока звонки разрешены только администратору приложения — кнопка только в личке с admin. */
  const canShowPrivateCallToAdmin = useMemo(() => {
    if (!CALLS_FEATURE_ENABLED) return false;
    if (isDraft || !conv || conv.type !== 'private' || !conv.other_member || isAccessRequestsChannel) {
      return false;
    }
    const om = conv.other_member;
    return isAppAdministratorRole(om.app_role ?? null, om.app_roles ?? null);
  }, [conv, isAccessRequestsChannel, isDraft]);

  useEffect(() => {
    setCallHeaderMenuOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (!callHeaderMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = callHeaderMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setCallHeaderMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCallHeaderMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [callHeaderMenuOpen]);

  useEffect(() => {
    if (isDraft) {
      setChatMeta(null);
      setPinnedMessages([]);
      setMentionList([]);
      setGroupParticipantIds([]);
      setChatHeadReady(true);
      return;
    }
    let alive = true;
    setChatHeadReady(false);

    const loadChatHeadData = async () => {
      const isGroupLike = Boolean(conv && conv.type !== 'private');
      const [metaRes, pinsRes, participantsRes] = await Promise.all([
        api.fetchConversationMeta(conversationId),
        isGroupLike ? api.fetchPinnedMessages(conversationId) : Promise.resolve<api.MessageWithSender[]>([]),
        isGroupLike ? api.fetchParticipants(conversationId) : Promise.resolve<api.Participant[]>([]),
      ]);
      const me = useChatStore.getState().currentMemberId;
      const nextParticipantIds = participantsRes.map((p) => p.member_id);
      const nextMentionList = participantsRes
        .filter((p) => me == null || p.member_id !== me)
        .map((p) => ({
          id: p.member_id,
          label:
            (p.first_name ? `${p.first_name} ${p.last_name ?? ''}`.trim() : p.name) ||
            `Участник ${p.member_id}`,
        }));

      if (!alive) return;
      // Один проход обновлений вместо каскада независимых setState.
      setChatMeta(metaRes);
      setPinnedMessages(pinsRes);
      setGroupParticipantIds(nextParticipantIds);
      setMentionList(nextMentionList);
      setChatHeadReady(true);
    };

    void loadChatHeadData().catch(() => {
      if (!alive) return;
      setChatMeta(null);
      setPinnedMessages([]);
      setMentionList([]);
      setGroupParticipantIds([]);
      setChatHeadReady(true);
    });

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

  /** Сброс announcer-состояния при переключении чата. */
  useEffect(() => {
    lastAnnouncedTailIdRef.current = null;
    prevIsOnlineRef.current = null;
    setNewMessageAnnouncement('');
    setPresenceAnnouncement('');
  }, [conversationId]);

  /**
   * Announcer для входящих сообщений: срабатывает только на реально новое сообщение
   * (сдвиг «хвоста»), игнорирует:
   *   - подгрузку истории (prepend в начало — хвост не сдвигается);
   *   - optimistic-echo собственного отправления (`temp-*` / `pending-*` id);
   *   - собственное сообщение (его уже видно на экране);
   *   - повторный эффект с тем же последним id.
   */
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    const idStr = String(last.id);
    if (!/^\d+$/.test(idStr)) return;
    if (last.sender_id != null && Number(last.sender_id) === Number(currentMemberId)) {
      lastAnnouncedTailIdRef.current = idStr;
      return;
    }
    if (lastAnnouncedTailIdRef.current == null) {
      // Первый замер после открытия чата: фиксируем точку, чтобы не зачитывать всю историю.
      lastAnnouncedTailIdRef.current = idStr;
      return;
    }
    if (idStr === lastAnnouncedTailIdRef.current) return;
    try {
      if (BigInt(idStr) <= BigInt(lastAnnouncedTailIdRef.current)) return;
    } catch {
      /* несущественный id — пропускаем проверку монотонности */
    }
    lastAnnouncedTailIdRef.current = idStr;
    const speaker =
      last.sender_name ||
      (last.sender_id != null ? participantLabelById[Number(last.sender_id)] : undefined) ||
      'Новое сообщение';
    const raw = String(last.content ?? '').replace(/\s+/g, ' ').trim();
    const preview = raw.length > 140 ? `${raw.slice(0, 140)}…` : raw || 'вложение';
    setNewMessageAnnouncement(`${speaker}: ${preview}`);
  }, [messages, currentMemberId, participantLabelById]);

  /**
   * Typing-announcer: выводится в отдельный sr-only буфер.
   * Отдаём только имя + «печатает», без «…», — многоточие SR зачитывает как паузу.
   */
  const typingAnnouncement = useMemo(() => {
    if (typingUsers.length === 0) return '';
    const names = typingUsers
      .map((u: { memberName: string }) => u.memberName.split(' ')[0])
      .filter(Boolean);
    if (names.length === 0) return '';
    const verb = names.length > 1 ? 'печатают' : 'печатает';
    return `${names.join(', ')} ${verb}`;
  }, [typingUsers]);

  /**
   * Presence-announcer (только личный чат). Озвучиваем ТОЛЬКО переход online↔offline,
   * не начальное состояние (иначе каждое открытие чата = «Иван в сети»).
   */
  useEffect(() => {
    if (!conv || conv.type !== 'private' || !conv.other_member) {
      prevIsOnlineRef.current = null;
      return;
    }
    const next = onlineMembers.has(conv.other_member.id);
    const prev = prevIsOnlineRef.current;
    if (prev === null) {
      prevIsOnlineRef.current = next;
      return;
    }
    if (prev === next) return;
    prevIsOnlineRef.current = next;
    const fn = conv.other_member.first_name || '';
    const ln = conv.other_member.last_name || '';
    const name = `${fn} ${ln}`.trim() || conv.other_member.name || 'Собеседник';
    setPresenceAnnouncement(next ? `${name} в сети` : `${name} оффлайн`);
  }, [onlineMembers, conv]);

  const canPostMessages =
    !isAccessRequestsChannel && (isDraft || chatMeta?.my_effective_permissions?.can_send_messages !== false);
  /** В группах/каналах медио может быть отключено отдельно от текста. */
  const canSendAttachments =
    canPostMessages &&
    (isDraft ||
      chatMeta == null ||
      chatMeta.my_effective_permissions?.can_send_media !== false);
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
    restoredChatScrollRef.current = false;
    restoreScrollRef.current = null;
    if (!isDraft) {
      // При открытии чата всегда подтягиваем первую страницу (как в Telegram), без антидребезга 1.5s.
      void loadMessages(conversationId, false, { force: true });
    }
  }, [conversationId, loadMessages]);

  const lastNumericMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const id = String(messages[i]?.id ?? '').trim();
      if (/^\d+$/.test(id)) return id;
    }
    return null;
  }, [messages]);

  const unreadCount = useMemo(
    () => conversations.find((c) => c.id === conversationId)?.unread_count ?? 0,
    [conversations, conversationId],
  );

  const debouncedMarkAsRead = useCallback(
    (convId: string) => {
      if (markAsReadTimerRef.current) {
        clearTimeout(markAsReadTimerRef.current);
      }
      markAsReadTimerRef.current = setTimeout(() => {
        void markAsRead(convId);
      }, 400);
    },
    [markAsRead],
  );

  // On open: mark read only when we have a real numeric tail id.
  useEffect(() => {
    if (isDraft) return;
    if (!conversationId || !lastNumericMessageId) return;
    if (messages.length === 0) return;
    if (unreadCount <= 0) return;
    if (!isMessengerChatReadSurfaceOpen()) return;
    debouncedMarkAsRead(conversationId);
  }, [conversationId, lastNumericMessageId, messages.length, unreadCount, isDraft, debouncedMarkAsRead]);

  useEffect(() => {
    if (isDraft) return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isMessengerChatReadSurfaceOpen()) return;
      if (!conversationId || !lastNumericMessageId) return;
      if (messages.length === 0) return;
      debouncedMarkAsRead(conversationId);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [conversationId, isDraft, lastNumericMessageId, messages.length, debouncedMarkAsRead]);

  useEffect(() => {
    return () => {
      if (markAsReadTimerRef.current) {
        clearTimeout(markAsReadTimerRef.current);
        markAsReadTimerRef.current = null;
      }
    };
  }, []);

  const flushVisibleReads = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(() => {
      if (!isMessengerChatReadSurfaceOpen()) return;
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
      if (!row) return index;
      // Стабильный ключ на всех стадиях жизни сообщения.
      // id меняется дважды: `temp-<rand>` (optimistic) → `pending-<uuid>` (early WS,
      // может ещё оставаться у старых клиентов) → `<bigint>` (после INSERT).
      // Каждая смена id при старом getItemKey = размонтирование строки в
      // `@tanstack/react-virtual`: пересчёт размера, перезапуск CSS-переходов,
      // «прыжок» скролла. `client_msg_id` одинаков через все стадии — держим ключ
      // на нём, а на `id` падаем только для старых сообщений из истории,
      // у которых `client_msg_id` пустой (мигрированы на `NULL` в initDb.ts).
      // Префиксы `c:` / `i:` исключают коллизию, если client_msg_id случайно
      // выглядит как bigint.
      return row.client_msg_id ? `c:${row.client_msg_id}` : `i:${row.id}`;
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

  /** Сброс «новые внизу» и якоря хвоста при смене чата. */
  useEffect(() => {
    setShowNewBelow(false);
    lastTailIdSeenRef.current = null;
  }, [conversationId]);

  /** Если хвост списка сменился, пользователь не у низа — показываем FAB (только входящие). */
  useEffect(() => {
    if (messages.length === 0) {
      lastTailIdSeenRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (!last) return;
    const idStr = String(last.id);
    const prevTail = lastTailIdSeenRef.current;
    lastTailIdSeenRef.current = idStr;
    if (prevTail == null) return;
    if (idStr === prevTail) return;
    if (nearBottomRef.current) {
      setShowNewBelow(false);
      return;
    }
    const isOwn =
      currentMemberId != null &&
      last.sender_id != null &&
      Number(last.sender_id) === Number(currentMemberId);
    if (isOwn) return;
    setShowNewBelow(true);
  }, [messages, currentMemberId]);

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
      if (m.is_deleted || inferMessengerPayloadType(m) !== 'image') continue;
      const payload = (m.payload ?? {}) as Record<string, unknown>;
      const album = Array.isArray(payload.images) ? payload.images : [];
      if (album.length > 0) {
        for (const img of album) {
          const row = typeof img === 'object' && img !== null ? (img as Record<string, unknown>) : {};
          const raw = getAlbumImageUrl(row);
          const src = resolvePublicUrl(raw) ?? raw;
          if (src) out.push({ messageId: String(m.id), src });
        }
        continue;
      }
      const raw = getPrimaryAttachmentUrl(payload);
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

  const scrollToBottomSmooth = useCallback(() => {
    nearBottomRef.current = true;
    setShowNewBelow(false);
    const n = groupedMessages.length;
    if (n > 0) {
      rowVirtualizer.scrollToIndex(n - 1, { align: 'end', behavior: 'smooth' });
    } else {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [groupedMessages.length, rowVirtualizer]);

  const handleScroll = useCallback(() => {
    if (scrollMeasureRafRef.current != null) return;
    scrollMeasureRafRef.current = requestAnimationFrame(() => {
      scrollMeasureRafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const pad = 140;
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < pad;
      nearBottomRef.current = near;
      if (near) setShowNewBelow(false);

      if (el.scrollTop < 72 && hasMore && !loading && !restoreScrollRef.current) {
        restoreScrollRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
        void loadMessages(conversationId, true);
      }
    });
  }, [conversationId, hasMore, loading, loadMessages]);

  useLayoutEffect(() => {
    if (restoredChatScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const raw = sessionStorage.getItem(chatScrollStorageKey);
    if (!raw) {
      restoredChatScrollRef.current = true;
      return;
    }
    const top = Number(raw);
    restoredChatScrollRef.current = true;
    if (!Number.isFinite(top) || top <= 0) return;
    nearBottomRef.current = false;
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = top;
    });
  }, [chatScrollStorageKey, messages.length]);

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
      setShowNewBelow(false);
      return;
    }

    if (nearBottomRef.current && listCount === 0) {
      el.scrollTop = el.scrollHeight;
      setShowNewBelow(false);
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
      return '';
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
      if (!chatHeadReady) {
        return ' ';
      }
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
  }, [chatHeadReady, conv, typingUsers, isOnline, isDraft, memberLastSeenAt, groupParticipantIds.length, onlineInGroupCount]);

  const initiateCall = useCallback(
    (callType: 'audio' | 'video') => {
      if (!CALLS_FEATURE_ENABLED) {
        emitAppToast('Звонки временно отключены', 'info');
        return;
      }
      if (isDraft || isAccessRequestsChannel) return;
      if (conv?.type !== 'private' || !conv.other_member) return;
      if (!isAppAdministratorRole(conv.other_member.app_role ?? null, conv.other_member.app_roles ?? null)) {
        return;
      }
      requestCallNotificationsFromUserGesture();
      const callId = crypto.randomUUID();
      const sent = sendRealtimeJson({
        type: 'call:initiate',
        callId,
        receiverId: conv.other_member.id,
        conversationId,
        callType,
      });
      if (!sent) {
        emitAppToast('Нет подключения к серверу. Повторите звонок через пару секунд.', 'error');
        return;
      }
      const fn = conv.other_member.first_name || '';
      const ln = conv.other_member.last_name || '';
      const peerName = `${fn} ${ln}`.trim() || conv.other_member.name;
      const peerAvatar = conv.other_member.avatar_url ?? '';
      useCallStore.getState().openCall({
        callId,
        conversationId,
        peerId: conv.other_member.id,
        peerName,
        peerAvatar,
        callType,
        isInitiator: true,
      });
    },
    [conversationId, conv, isAccessRequestsChannel, isDraft],
  );

  const typingFirstNames = useMemo(
    () =>
      typingUsers
        .map((u: { memberName: string }) => u.memberName.split(' ')[0])
        .filter((n: string) => Boolean(n)),
    [typingUsers],
  );

  const typingPresentVerb = typingFirstNames.length > 1 ? 'печатают' : 'печатает';

  const headerStatusClass =
    typingUsers.length > 0
      ? 'font-medium text-primary'
      : isDraft || (conv && conv.type !== 'private')
        ? 'text-gray-500'
        : 'text-gray-500';

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
    const currentTop = scrollRef.current?.scrollTop ?? 0;
    sessionStorage.setItem(chatScrollStorageKey, String(currentTop));
    const backTo = `/messenger?conversationId=${encodeURIComponent(conversationId)}`;
    if (interlocutorProfilePath) {
      navigate(interlocutorProfilePath, { state: { backTo, backLabel: 'В чат' } });
      return;
    }
    navigate(`/messenger/chat/${conversationId}/manage`);
  }, [interlocutorProfilePath, navigate, conversationId, chatScrollStorageKey]);

  const headerInfoAriaLabel =
    interlocutorProfilePath != null ? 'Открыть страницу собеседника' : 'Сведения о чате';
  const showHeaderSkeleton = !isDraft && (conv?.type === 'group' || conv?.type === 'channel') && !chatHeadReady;

  return (
    <div className="tg-chat-window box-border flex w-full max-w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {/* Safe-area только на корне (.tg-chat-window) в messenger.css для iOS — не дублировать здесь */}
      <header className="chat-header sticky top-0 z-[100] w-full min-w-0 shrink-0 border-b border-gray-200/60 bg-[var(--surface-elevated)]">
        <div className="mx-auto flex min-h-[52px] w-full min-w-0 max-w-full items-center gap-1 px-1 py-1.5 sm:gap-2 sm:px-2 sm:py-2">
          {/* Слева: «Назад» — только мобилка; на ПК список чатов всегда слева. */}
          <div className="flex shrink-0 items-center md:hidden">
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад к списку чатов"
              className="chat-back-btn flex max-w-[min(7rem,28vw)] items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-1 text-lg leading-none text-blue-500 transition-colors active:bg-[var(--surface)] sm:max-w-[7.5rem] sm:pl-1.5 sm:pr-2"
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
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg py-0.5 pl-0.5 pr-1 text-left transition-colors active:bg-[var(--surface)] sm:gap-3 sm:pr-2"
          >
            {showHeaderSkeleton ? (
              <>
                <div className="tg-chat-header-skeleton tg-chat-header-skeleton--avatar h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10" />
                <div className="min-w-0 flex-1 overflow-hidden py-0.5">
                  <div className="tg-chat-header-skeleton tg-chat-header-skeleton--title max-w-[10.5rem] rounded-md" />
                  <div className="tg-chat-header-skeleton tg-chat-header-skeleton--subtitle mt-1 max-w-[8rem] rounded-md" />
                </div>
              </>
            ) : (
              <>
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold text-white sm:h-10 sm:w-10"
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
                  <div className="truncate text-base font-semibold leading-[1.2] text-[var(--text)] sm:text-lg">{displayName}</div>
                  {typingUsers.length > 0 ? (
                    <div
                      className={['truncate text-xs leading-tight sm:text-sm', headerStatusClass].join(' ')}
                      aria-label={`${typingFirstNames.join(', ')} ${typingPresentVerb}`}
                    >
                      <span>{typingFirstNames.join(', ')} {typingPresentVerb}</span>
                      <span className="tg-typing-dots" aria-hidden>
                        <span className="tg-typing-dots__dot" />
                        <span className="tg-typing-dots__dot" />
                        <span className="tg-typing-dots__dot" />
                      </span>
                    </div>
                  ) : headerSubtitle ? (
                    <div className={['last-seen user-status truncate text-xs leading-tight sm:text-sm', headerStatusClass].join(' ')}>
                      {headerSubtitle}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {/* Справа: действия */}
          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1">
            {showHeaderSkeleton ? (
              <>
                <span className="tg-chat-header-skeleton tg-chat-header-skeleton--action rounded-full" aria-hidden />
                <span className="tg-chat-header-skeleton tg-chat-header-skeleton--action rounded-full" aria-hidden />
                <span className="tg-chat-header-skeleton tg-chat-header-skeleton--action rounded-full" aria-hidden />
              </>
            ) : (
              <>
                {!isDraft && firstUnreadMessageId && (conv?.unread_count ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={() => firstUnreadMessageId && jumpToMessage(firstUnreadMessageId)}
                    aria-label="К первому непрочитанному"
                    title="К непрочитанным"
                    className="inline-flex h-10 min-w-[2rem] items-center justify-center rounded-full px-1.5 text-sm font-extrabold text-primary transition-colors hover:bg-primary/10 active:bg-primary/15"
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
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors active:bg-[var(--surface)]"
                  >
                    <LuLayers size={20} strokeWidth={2.25} />
                  </button>
                ) : null}
                {!isDraft && canShowPrivateCallToAdmin ? (
                  <div className="relative" ref={callHeaderMenuRef}>
                    <button
                      type="button"
                      onClick={() => setCallHeaderMenuOpen((v) => !v)}
                      aria-label="Позвонить"
                      title="Позвонить"
                      aria-haspopup="menu"
                      aria-expanded={callHeaderMenuOpen}
                      className={[
                        'tg-chat-header-call-btn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200',
                        'text-primary ring-2 ring-primary/[0.18] bg-primary/[0.07] shadow-sm',
                        'hover:bg-primary/[0.13] hover:ring-primary/30 active:scale-[0.96]',
                        callHeaderMenuOpen ? 'bg-primary/[0.14] ring-primary/35' : '',
                      ].join(' ')}
                    >
                      <LuPhone className="h-[20px] w-[20px]" strokeWidth={2.35} aria-hidden />
                    </button>
                    {callHeaderMenuOpen ? (
                      <div
                        role="menu"
                        className="tg-chat-header-call-menu absolute right-0 top-[calc(100%+6px)] z-[220] min-w-[12.5rem] overflow-hidden rounded-2xl border border-stone-200/90 bg-[var(--surface-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:border-white/[0.1] dark:shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
                      >
                        <p className="px-3.5 pb-1.5 pt-0.5 text-[11px] font-medium leading-snug text-[var(--text-secondary)]">
                          Звонок доступен только администратору церкви.
                        </p>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition-colors hover:bg-stone-100/90 active:bg-stone-200/80 dark:hover:bg-stone-800/80"
                          onClick={() => {
                            setCallHeaderMenuOpen(false);
                            initiateCall('audio');
                          }}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <LuPhone className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block leading-tight">Аудиозвонок</span>
                            <span className="mt-0.5 block text-xs font-medium text-[var(--text-secondary)]">
                              Только голос
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition-colors hover:bg-stone-100/90 active:bg-stone-200/80 dark:hover:bg-stone-800/80"
                          onClick={() => {
                            setCallHeaderMenuOpen(false);
                            initiateCall('video');
                          }}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <LuVideo className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block leading-tight">Видеозвонок</span>
                            <span className="mt-0.5 block text-xs font-medium text-[var(--text-secondary)]">
                              С камерой
                            </span>
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(`/messenger/chat/${conversationId}/manage`)}
                  aria-label="Управление чатом"
                  title="Управление"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors active:bg-[var(--surface)]"
                >
                  <span className="text-lg font-black leading-none" aria-hidden>
                    ⋮
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  aria-label="Поиск по сообщениям"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors active:bg-[var(--surface)]"
                >
                  <LuSearch size={20} strokeWidth={2.25} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="tg-chat-window__body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!isDraft && pinnedMessages.length > 0 ? (
          <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/90 px-3 py-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-amber-900/80">Закреплено</p>
            <div className="mt-1 space-y-1">
              {pinnedMessages.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => jumpToMessage(String(pm.id))}
                  className="block w-full truncate rounded-lg px-2 py-1 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-amber-100/80"
                >
                  {String(pm.content || '').trim().slice(0, 100) || 'Сообщение'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/*
         * Три независимых sr-only live-региона. `role="status"` + `aria-live="polite"`
         * (неперебивающий приоритет), `aria-atomic="true"` — SR зачитывает весь
         * обновлённый текст как единое объявление, а не diff по словам. Расположены
         * ВНЕ виртуализированного контейнера: иначе Virtual-размонтирование обнуляло бы
         * объявление до того, как VoiceOver успел его прочитать.
         */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {newMessageAnnouncement}
        </div>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {typingAnnouncement}
        </div>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {presenceAnnouncement}
        </div>

        <div
          className="messages-area relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-transparent px-3 py-3 sm:gap-3 sm:p-4"
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Сообщения в чате"
        >
        {showNewBelow ? (
          <button
            type="button"
            className="tg-scroll-new-fab"
            onClick={scrollToBottomSmooth}
            aria-label="Прокрутить к новым сообщениям"
          >
            <span aria-hidden>↓</span>
            <span>Новые</span>
          </button>
        ) : null}
        {hasMore ? (
          <div className="flex justify-center">
            <div className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] shadow-sm ring-1 ring-stone-200/50">
              {loading ? 'Загрузка истории…' : '↑ Ранние сообщения'}
            </div>
          </div>
        ) : null}

        {messages.length === 0 && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <p className="text-base font-semibold text-[var(--text)]">Пока тихо</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
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
                  role="group"
                  aria-roledescription="Сообщение"
                  aria-posinset={virtualRow.index + 1}
                  aria-setsize={listCount}
                  style={{
                    position: 'absolute',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex flex-col gap-3">
                    {msg.showDate ? (
                      <div className="flex justify-center">
                        <span className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] shadow-sm ring-1 ring-stone-200/50">
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
                        accessRequestsSystemChannel={isAccessRequestsChannel}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      <div className="tg-chat-window__composer message-input-bar sticky bottom-0 z-20 w-full min-w-0 max-w-full shrink-0 border-t border-stone-200/70 bg-[var(--tg-bg)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        {isAccessRequestsChannel ? (
          <div className="pb-1 pt-0.5 text-center">
            <p className="mx-auto max-w-md px-2 text-[13px] leading-snug text-[var(--text-secondary)]">
              Канал уведомлений: сообщения приходят только от бота «Заявки». Набор текста недоступен — решение по
              заявке принимается в карточке ниже.
            </p>
          </div>
        ) : (
          <ChatInput
            conversationId={conversationId}
            sendTypingStart={sendTypingStart}
            sendTypingStop={sendTypingStop}
            canSend={canPostMessages}
            canSendAttachments={canSendAttachments}
            mentionParticipants={conv && conv.type !== 'private' ? mentionList : []}
            participantLabelById={participantLabelById}
          />
        )}
      </div>

      {showSearch && typeof document !== 'undefined'
        ? createPortal(
            <SearchChat
              conversationId={conversationId}
              onClose={() => setShowSearch(false)}
              onJumpToMessage={(id) => {
                jumpToMessage(id);
                setShowSearch(false);
              }}
            />,
            document.body,
          )
        : null}

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
