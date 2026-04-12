import { create } from 'zustand';
import axios from 'axios';
import type { ConversationListItem, MessageWithSender, SearchMember } from './api/messengerApi';
import * as api from './api/messengerApi';
import { emitAppToast } from '../../lib/uiFeedback';
import { playAudio } from '../../utils/audio';
import { extractMentionMemberIdsFromText, normalizeMentionsToCanonical } from './mentionUtils';

/** Личный чат до первого сообщения: нет строки в БД, пока пользователь не отправит сообщение. */
export const DRAFT_PRIVATE_PREFIX = 'draft:';

export function isDraftPrivateConversationId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(DRAFT_PRIVATE_PREFIX);
}

export function parseDraftPrivateMemberId(id: string): number | null {
  if (!isDraftPrivateConversationId(id)) return null;
  const n = Number(id.slice(DRAFT_PRIVATE_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── Types ────────────────────────────────────────────────────

interface TypingUser {
  memberId: number;
  memberName: string;
  /** Timeout ID to auto-clear */
  timer: ReturnType<typeof setTimeout>;
}

interface ChatState {
  // --- Current user ---
  currentMemberId: number | null;

  // --- Conversation list ---
  conversations: ConversationListItem[];
  conversationsLoaded: boolean;
  conversationsLoading: boolean;
  /** Timestamp of last successful conversations fetch (ms) */
  conversationsLastLoadedAt: number;

  // --- Active chat ---
  activeConversationId: string | null;
  /** Собеседник для черновика личного чата (пока нет conversation в API). */
  privateDraftPeer: SearchMember | null;

  // --- Messages cache: conversationId → messages ---
  messagesByConv: Record<string, MessageWithSender[]>;
  messagesLoading: Record<string, boolean>;
  /** conversationId -> last successful loadMessages timestamp (ms) */
  messagesLastLoadedAt: Record<string, number>;
  /** True means there are older messages to load */
  hasMore: Record<string, boolean>;

  // --- Read cursors (read receipts) ---
  /** conversationId -> memberId -> lastReadMessageId */
  readCursorsByConv: Record<string, Record<number, string>>;
  /** convId → my own read cursor (separate from readCursorsByConv for other people) */
  myReadCursorByConv: Record<string, string>;

  // --- Typing indicator: convId → memberId[] ---
  typingByConv: Record<string, TypingUser[]>;

  /** Счётчик для перезагрузки закреплённых сообщений (WS `conv:updated`). */
  pinnedBumpByConv: Record<string, number>;
  bumpPinnedRevision: (conversationId: string) => void;

  // --- Online presence ---
  onlineMembers: Set<number>;
  /** ISO last disconnect (WS + список чатов), для подписи «был(а) …». */
  memberLastSeenAt: Record<number, string>;

  // --- Total unread ---
  totalUnread: number;

  // --- Smart tabs ---
  activeTab: ChatTab;
  setActiveTab: (tab: ChatTab) => void;
  getConversationsForActiveTab: () => ConversationListItem[];
  getUnreadForTab: (tab: ChatTab) => number;

  // --- Reply state ---
  replyToMessage: MessageWithSender | null;
  /** Swipe-to-reply target (native gesture) */
  replyingTo: MessageWithSender | null;

  // --- Edit state ---
  editingMessage: MessageWithSender | null;

  // --- Search state ---
  searchResults: MessageWithSender[];
  searchQuery: string;
  searchLoading: boolean;
  globalSearchResults: Array<MessageWithSender & { conversationTitle: string }>;
  globalSearchLoading: boolean;

  // --- Drafts ---
  drafts: Record<string, string>;
  saveDraft: (conversationId: string, content: string) => void;
  loadDrafts: () => void;
  clearDraft: (conversationId: string) => void;

  // --- Actions ---
  loadConversations: () => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  openPrivateDraft: (peer: SearchMember) => void;
  loadMessages: (conversationId: string, older?: boolean) => Promise<void>;
  /** После reconnect: догрузить сообщения новее max(реальный id) без сброса истории. */
  catchUpMessagesAfter: (conversationId: string) => Promise<void>;
  hydrateFromCache: () => void;

  /**
   * Черновик личного чата → реальный id в БД (один раз перед первым сообщением/вложением).
   * Если id не draft — возвращает его же.
   */
  promoteDraftToRealConversation: (conversationId: string) => Promise<string | null>;

  /** Optimistic send: message appears instantly, then confirmed by server */
  sendMessage: (
    conversationId: string,
    content: string,
    replyToId?: string | null,
    payloadType?: api.MessagePayloadType,
    payload?: api.MessagePayload,
  ) => Promise<void>;
  retrySendMessage: (conversationId: string, tempId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  markReadUpTo: (conversationId: string, messageId: string) => Promise<void>;
  /** Mark chat as read on open (server + local unread reset). */
  markAsRead: (conversationId: string) => Promise<void>;

  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;

  setReplyTo: (msg: MessageWithSender | null) => void;
  setReplyingTo: (msg: MessageWithSender | null) => void;
  setEditing: (msg: MessageWithSender | null) => void;

  // --- Search ---
  searchMessages: (query: string, conversationId: string) => Promise<void>;
  clearSearch: () => void;
  searchAllConversations: (query: string) => Promise<void>;
  clearGlobalSearch: () => void;

  // --- WS event handlers (called by messengerWs hook) ---
  handleNewMessage: (convId: string, msg: MessageWithSender) => void;
  handleMessageSendFailed: (convId: string, clientMsgId: string) => void;
  handleMessageEdited: (convId: string, msgId: string, content: string, updatedAt: string) => void;
  handleMessagePayloadUpdated: (
    convId: string,
    msgId: string,
    payload: Record<string, unknown>,
    updatedAt: string,
  ) => void;
  handleMessageDeleted: (convId: string, msgId: string) => void;
  handleReaction: (convId: string, msgId: string, emoji: string, memberId: number, action: 'add' | 'remove') => void;
  /** Merge poll vote counts from WebSocket (all clients) or after local vote. */
  handlePollTallies: (convId: string, messageId: string, tallies: number[], myOptions?: number[]) => void;
  votePoll: (messageId: string, optionIndexes: number[]) => Promise<void>;
  handleTypingStart: (convId: string, memberId: number, memberName: string) => void;
  handleTypingStop: (convId: string, memberId: number) => void;
  handleConvCreated: (conv: ConversationListItem) => void;
  handleConvUpdated: (convId: string, patch: Partial<ConversationListItem>) => void;
  handleReadUpdated: (convId: string, memberId: number, lastReadMsgId: string) => void;
  handlePresenceOnline: (memberId: number) => void;
  handlePresenceOffline: (memberId: number, lastSeenAt?: string) => void;
  setOnlineMembers: (ids: number[]) => void;
  setCurrentMemberId: (id: number) => void;

  /** WS: история чата очищена на сервере. */
  handleConvHistoryCleared: (conversationId: string) => void;
  patchChatMyUi: (conversationId: string, body: api.PatchMyConversationUiBody) => Promise<void>;
  clearChatHistory: (conversationId: string) => Promise<void>;
  leaveChat: (conversationId: string) => Promise<void>;

  refreshUnread: () => Promise<void>;
}

export type ChatTab = 'all' | 'personal' | 'services' | 'notifications';

export const EMPTY_ARRAY: any[] = [];
export const EMPTY_OBJECT: any = {};

/**
 * Учёт в бейдже непрочитанного: только явно непрочитанное и не от текущего пользователя.
 * Без `sender_id` не считаем (нет надёжного отличия «своё / чужое»).
 */
function messageCountsAsUnreadForCurrentUser(
  msg: Pick<MessageWithSender, 'is_read' | 'sender_id'>,
  currentMemberId: number | null,
): boolean {
  if (currentMemberId == null) return false;
  if (msg.sender_id != null && Number(msg.sender_id) === Number(currentMemberId)) return false;
  return msg.is_read === false;
}

let onlineRetryBound = false;
let retryInFlight = false;
let outboxRetryTimer: number | null = null;
let inMemoryOutbox: OutboxItem[] = [];

type OutboxItem = {
  queueId: string;
  tempId: string;
  conversationId: string;
  content: string;
  replyToId: string | null;
  clientMsgId: string | null;
  payloadType: api.MessagePayloadType;
  payload: api.MessagePayload;
  createdAt: string;
};

type MessengerSnapshot = {
  conversations: ConversationListItem[];
  messagesByConv: Record<string, MessageWithSender[]>;
  hasMore: Record<string, boolean>;
  totalUnread: number;
  outbox: OutboxItem[];
  savedAt: string;
};

function getSnapshotKey(userId: number | null): string {
  return userId ? `messenger_snapshot_v2_${userId}` : 'messenger_snapshot_v2_guest';
}

function saveSnapshot(state: ChatState): void {
  try {
    if (typeof localStorage === 'undefined') return;

    // Filter out temporary/pending messages from snapshot
    const cleanMessagesByConv: Record<string, MessageWithSender[]> = {};
    for (const [convId, msgs] of Object.entries(state.messagesByConv || {})) {
      cleanMessagesByConv[convId] = msgs.filter(
        (m) =>
          !String(m.id).startsWith('temp-') &&
          !String(m.id).startsWith('pending-') &&
          m.status !== 'sending',
      );
    }

    const snap: MessengerSnapshot = {
      conversations: state.conversations || [],
      messagesByConv: cleanMessagesByConv,
      hasMore: state.hasMore || {},
      totalUnread: Number(state.totalUnread || 0),
      outbox: [],
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getSnapshotKey(state.currentMemberId), JSON.stringify(snap));
  } catch {
    /* ignore localStorage quota/errors */
  }
}

function saveOutboxSnapshot(get: () => ChatState, outbox: OutboxItem[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const s = get();
    const snapRaw = localStorage.getItem(getSnapshotKey(s.currentMemberId));
    const snap: MessengerSnapshot = snapRaw ? JSON.parse(snapRaw) : {
      conversations: s.conversations || [],
      messagesByConv: s.messagesByConv || {},
      hasMore: s.hasMore || {},
      totalUnread: Number(s.totalUnread || 0),
      outbox: [],
      savedAt: new Date().toISOString(),
    };
    snap.outbox = outbox;
    snap.savedAt = new Date().toISOString();
    localStorage.setItem(getSnapshotKey(s.currentMemberId), JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function enqueueOutbox(get: () => ChatState, item: OutboxItem): number {
  inMemoryOutbox = [...inMemoryOutbox, item];
  saveOutboxSnapshot(get, inMemoryOutbox);
  return inMemoryOutbox.length;
}

function dequeueOutbox(get: () => ChatState, queueId: string): number {
  inMemoryOutbox = inMemoryOutbox.filter((q) => q.queueId !== queueId);
  saveOutboxSnapshot(get, inMemoryOutbox);
  if (inMemoryOutbox.length === 0) {
    stopOutboxPump();
  }
  return inMemoryOutbox.length;
}

function readSnapshot(userId: number | null): MessengerSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(getSnapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MessengerSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function runRetryAllFailed(get: () => ChatState) {
  if (retryInFlight) return;
  retryInFlight = true;
  try {
    const state = get();
    const entries = Object.entries(state.messagesByConv);
    // Build a stable queue (oldest first) to preserve conversation history order.
    const queue: Array<{ convId: string; tempId: string; createdAt: string }> = [];
    for (const [convId, msgs] of entries) {
      for (const m of msgs) {
        if (m.status === 'error') {
          queue.push({ convId, tempId: String(m.id), createdAt: String(m.created_at ?? '') });
        }
      }
    }
    queue.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const item of queue) {
      // Stop if we went offline again.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      // Small spacing to avoid burst on reconnect.
      // eslint-disable-next-line no-await-in-loop
      await get().retrySendMessage(item.convId, item.tempId);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    retryInFlight = false;
  }
}

async function flushOutbox(get: () => ChatState) {
  if (inMemoryOutbox.length === 0) {
    stopOutboxPump();
    return;
  }
  const queue = [...inMemoryOutbox].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const item of queue) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    // eslint-disable-next-line no-await-in-loop
    await get().retrySendMessage(item.conversationId, item.tempId);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 180));
  }
}

function ensureOutboxPump(get: () => ChatState) {
  if (typeof window === 'undefined') return;
  if (inMemoryOutbox.length === 0) return;
  if (outboxRetryTimer) return;
  outboxRetryTimer = window.setInterval(() => {
    if (navigator.onLine === false) return;
    void flushOutbox(get);
  }, 7000);
}

function stopOutboxPump() {
  if (typeof window === 'undefined') return;
  if (outboxRetryTimer != null) {
    window.clearInterval(outboxRetryTimer);
    outboxRetryTimer = null;
  }
}

function clearTypingForConversation(typingByConv: Record<string, TypingUser[]>, convId: string): void {
  const list = typingByConv[String(convId)] || [];
  for (const user of list) {
    clearTimeout(user.timer);
  }
}

function clearAllTypingTimers(typingByConv: Record<string, TypingUser[]>): void {
  for (const convId of Object.keys(typingByConv)) {
    clearTypingForConversation(typingByConv, convId);
  }
}

function hydrateFromCacheIntoStore(set: (partial: Partial<ChatState>) => void, get: () => ChatState) {
  const s = get();
  const snap = readSnapshot(s.currentMemberId);
  if (!snap) return;
  inMemoryOutbox = Array.isArray(snap.outbox) ? snap.outbox : [];
  set({
    conversations: snap.conversations || [],
    conversationsLoaded: (snap.conversations || []).length > 0,
    messagesByConv: snap.messagesByConv || {},
    hasMore: snap.hasMore || {},
    totalUnread: Number(snap.totalUnread || 0),
  });
  ensureOutboxPump(get);
}

function dedupeMessages(messages: MessageWithSender[]): MessageWithSender[] {
  const byId = new Set<string>();
  const byClientMsgId = new Set<string>();
  const out: MessageWithSender[] = [];
  for (const msg of messages) {
    const idKey = String(msg.id);
    if (byId.has(idKey)) continue;
    const clientKey = msg.client_msg_id ? String(msg.client_msg_id) : null;
    if (clientKey && byClientMsgId.has(clientKey)) continue;
    byId.add(idKey);
    if (clientKey) byClientMsgId.add(clientKey);
    out.push(msg);
  }
  return out;
}

/** Максимальный числовой id сообщения (без temp-*), для catch-up после reconnect. */
function maxRealServerMessageId(messages: MessageWithSender[]): string | null {
  let best: bigint | null = null;
  let bestStr: string | null = null;
  for (const m of messages) {
    const idKey = String(m.id);
    if (idKey.startsWith('temp-')) continue;
    if (!/^\d+$/.test(idKey)) continue;
    try {
      const b = BigInt(idKey);
      if (best === null || b > best) {
        best = b;
        bestStr = idKey;
      }
    } catch {
      /* ignore */
    }
  }
  return bestStr;
}

function sortMessagesByNumericIdAsc(messages: MessageWithSender[]): MessageWithSender[] {
  const decorated = messages.map((m, i) => {
    const idKey = String(m.id);
    if (idKey.startsWith('temp-') || !/^\d+$/.test(idKey)) {
      return { m, rank: null as bigint | null, i };
    }
    try {
      return { m, rank: BigInt(idKey), i };
    } catch {
      return { m, rank: null, i };
    }
  });
  decorated.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) {
      if (a.rank < b.rank) return -1;
      if (a.rank > b.rank) return 1;
      return 0;
    }
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    return a.i - b.i;
  });
  return decorated.map((x) => x.m);
}

function findConversationIdContainingMessage(
  messagesByConv: Record<string, MessageWithSender[]>,
  messageId: string,
): string | null {
  const mid = String(messageId);
  for (const [cid, list] of Object.entries(messagesByConv)) {
    if (list.some((m) => String(m.id) === mid)) return cid;
  }
  return null;
}

function listPreviewFromMessage(tail: MessageWithSender): NonNullable<ConversationListItem['last_message']> {
  return {
    id: String(tail.id),
    content: tail.content,
    sender_id: tail.sender_id,
    sender_name: tail.sender_name,
    created_at: tail.created_at,
    is_deleted: tail.is_deleted,
  };
}

/** Если правили/удалили текущее превью в списке чатов — обновить с учётом нового хвоста треда. */
function syncConversationLastMessageAfterMutation(
  conversations: ConversationListItem[],
  convId: string,
  newMsgs: MessageWithSender[],
  touchedMessageId: string,
): ConversationListItem[] {
  const conv = conversations.find((c) => c.id === convId);
  if (!conv?.last_message || String(conv.last_message.id) !== String(touchedMessageId)) {
    return conversations;
  }
  if (!newMsgs.length) {
    return conversations.map((c) => (c.id === convId ? { ...c, last_message: null } : c));
  }
  const tail = newMsgs[newMsgs.length - 1];
  return conversations.map((c) =>
    c.id === convId ? { ...c, last_message: listPreviewFromMessage(tail) } : c,
  );
}

function syncConversationLastMessageOnEdit(
  conversations: ConversationListItem[],
  convId: string,
  messageId: string,
  content: string,
): ConversationListItem[] {
  return conversations.map((c) => {
    if (c.id !== convId || !c.last_message || String(c.last_message.id) !== String(messageId)) {
      return c;
    }
    return { ...c, last_message: { ...c.last_message, content } };
  });
}

// ─── Store ────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  currentMemberId: null,
  conversations: [],
  conversationsLoaded: false,
  conversationsLoading: false,
  conversationsLastLoadedAt: 0,
  activeConversationId: null,
  privateDraftPeer: null,
  messagesByConv: {},
  messagesLoading: {},
  messagesLastLoadedAt: {},
  hasMore: {},
  readCursorsByConv: {},
  myReadCursorByConv: {},
  typingByConv: {},
  pinnedBumpByConv: {},
  onlineMembers: new Set(),
  memberLastSeenAt: {},
  totalUnread: 0,
  activeTab: 'all',
  replyToMessage: null,
  replyingTo: null,
  editingMessage: null,
  setActiveTab: (tab) => set({ activeTab: tab }),

  getConversationsForActiveTab: () => {
    const tab = get().activeTab;
    const list = get().conversations || EMPTY_ARRAY;
    if (tab === 'all') return list;
    return list.filter((c) => classifyConversation(c) === tab);
  },

  getUnreadForTab: (tab) => {
    const list = get().conversations || EMPTY_ARRAY;
    if (tab === 'all') return list.reduce((sum: number, c: any) => sum + (c.unread_count ?? 0), 0);
    return list.reduce((sum: number, c: any) => sum + (classifyConversation(c) === tab ? (c.unread_count ?? 0) : 0), 0);
  },
  searchResults: [],
  searchQuery: '',
  searchLoading: false,
  globalSearchResults: [],
  globalSearchLoading: false,
  drafts: {},

  hydrateFromCache: () => {
    hydrateFromCacheIntoStore(set, get);
  },

  // ─── Load conversations ───────────────────────────────────

  loadConversations: async () => {
    if (get().conversationsLoading) return;
    // Guard against rapid refetch loops (WS flaps / repeated events).
    // 1.5s cooldown is enough to prevent UI flicker while staying responsive.
    if (Date.now() - (get().conversationsLastLoadedAt || 0) < 1500) return;
    set({ conversationsLoading: true });
    try {
      const conversations = await api.fetchConversations();
      const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);
      const prevSeen = get().memberLastSeenAt;
      const memberLastSeenAt = { ...prevSeen };
      for (const c of conversations) {
        const om = c.other_member;
        const ls = om?.last_seen_at;
        if (om && ls) memberLastSeenAt[om.id] = ls;
      }
      set({
        conversations,
        conversationsLoaded: true,
        totalUnread,
        conversationsLastLoadedAt: Date.now(),
        memberLastSeenAt,
      });
      saveSnapshot(get());
    } catch (e) {
      console.error('[chatStore] loadConversations error:', e);
      const wasLoaded = get().conversationsLoaded;
      // Offline/backend down: use cached snapshot.
      hydrateFromCacheIntoStore(set, get);
      if (!wasLoaded) {
        emitAppToast('Нет соединения. Показываем кэшированные данные.', 'info');
      }
    } finally {
      set({ conversationsLoading: false });
    }
  },

  // ─── Active conversation ──────────────────────────────────

  setActiveConversation: (id) => {
    set((s) => ({
      activeConversationId: id,
      replyToMessage: null,
      editingMessage: null,
      privateDraftPeer: id && isDraftPrivateConversationId(id) ? s.privateDraftPeer : null,
    }));
    if (id && !get().messagesByConv[id] && !isDraftPrivateConversationId(id)) {
      void get().loadMessages(id);
    }
  },

  openPrivateDraft: (peer) => {
    const draftId = `${DRAFT_PRIVATE_PREFIX}${peer.id}`;
    set((s) => ({
      privateDraftPeer: peer,
      activeConversationId: draftId,
      replyToMessage: null,
      editingMessage: null,
      messagesByConv: {
        ...s.messagesByConv,
        [draftId]: s.messagesByConv[draftId] || [],
      },
      hasMore: { ...s.hasMore, [draftId]: false },
    }));
  },

  // ─── Load messages ────────────────────────────────────────

  loadMessages: async (conversationId, older = false) => {
    if (isDraftPrivateConversationId(conversationId)) return;
    const state = get();
    if (state.messagesLoading[conversationId]) return;
    if (!older) {
      const last = state.messagesLastLoadedAt[conversationId] || 0;
      if (Date.now() - last < 1500) return;
    }

    set((s) => ({
      messagesLoading: { ...s.messagesLoading, [conversationId]: true },
    }));

    try {
      const existing = state.messagesByConv[conversationId] || [];
      const beforeId = older && existing.length > 0 ? existing[0].id : undefined;
      const limit = 50;
      const messages = await api.fetchMessages(conversationId, beforeId, limit);

      set((s) => {
        const prev = older ? (s.messagesByConv[conversationId] || []) : [];
        const merged = older ? [...messages, ...prev] : messages;
        // Keep the same dedupe policy as optimistic/WS merge.
        const deduped = dedupeMessages(merged);

        return {
          messagesByConv: { ...s.messagesByConv, [conversationId]: deduped },
          hasMore: { ...s.hasMore, [conversationId]: messages.length >= limit },
          messagesLastLoadedAt: older
            ? s.messagesLastLoadedAt
            : { ...s.messagesLastLoadedAt, [conversationId]: Date.now() },
        };
      });
      saveSnapshot(get());
    } catch (e) {
      console.error('[chatStore] loadMessages error:', e);
    } finally {
      set((s) => ({
        messagesLoading: { ...s.messagesLoading, [conversationId]: false },
      }));
    }
  },

  catchUpMessagesAfter: async (conversationId) => {
    if (isDraftPrivateConversationId(conversationId)) return;
    const state = get();
    if (state.messagesLoading[conversationId]) return;

    const existing = state.messagesByConv[conversationId] || [];
    const afterSeed = maxRealServerMessageId(existing);
    if (afterSeed == null) {
      set((s) => ({
        messagesLastLoadedAt: { ...s.messagesLastLoadedAt, [conversationId]: 0 },
      }));
      await get().loadMessages(conversationId);
      return;
    }

    set((s) => ({
      messagesLoading: { ...s.messagesLoading, [conversationId]: true },
    }));

    try {
      const limit = 100;
      const batch: MessageWithSender[] = [];
      let cursor = afterSeed;
      for (let round = 0; round < 20; round += 1) {
        const page = await api.fetchMessages(conversationId, undefined, limit, cursor);
        if (!page.length) break;
        batch.push(...page);
        const last = page[page.length - 1];
        const lastId = String(last.id);
        if (!/^\d+$/.test(lastId)) break;
        if (BigInt(lastId) <= BigInt(cursor)) break;
        if (page.length < limit) break;
        cursor = lastId;
      }

      if (batch.length === 0) {
        return;
      }

      set((s) => {
        const prev = s.messagesByConv[conversationId] || [];
        const merged = dedupeMessages([...prev, ...batch]);
        const sorted = sortMessagesByNumericIdAsc(merged);
        return {
          messagesByConv: { ...s.messagesByConv, [conversationId]: sorted },
          messagesLastLoadedAt: { ...s.messagesLastLoadedAt, [conversationId]: Date.now() },
        };
      });
      saveSnapshot(get());
    } catch (e) {
      console.error('[chatStore] catchUpMessagesAfter error:', e);
    } finally {
      set((s) => ({
        messagesLoading: { ...s.messagesLoading, [conversationId]: false },
      }));
    }
  },

  promoteDraftToRealConversation: async (conversationId) => {
    if (!isDraftPrivateConversationId(conversationId)) return conversationId;
    const otherId = parseDraftPrivateMemberId(conversationId);
    if (otherId == null) return null;
    const peer = get().privateDraftPeer;
    if (!peer || peer.id !== otherId) {
      emitAppToast('Не удалось определить собеседника', 'error');
      return null;
    }
    try {
      const created = await api.createPersonalChat(otherId);
      const realId = created.conversationId;
      const draftKey = conversationId;
      set((s) => {
        const nextMsgs = { ...s.messagesByConv };
        const carry = nextMsgs[draftKey];
        delete nextMsgs[draftKey];
        let convs = s.conversations;
        if (created.conversation) {
          const rest = s.conversations.filter((c) => c.id !== created.conversation!.id);
          convs = [created.conversation, ...rest];
        }
        return {
          activeConversationId: realId,
          privateDraftPeer: null,
          messagesByConv: carry?.length ? { ...nextMsgs, [realId]: carry } : nextMsgs,
          conversations: convs,
          totalUnread: convs.reduce((sum, c) => sum + c.unread_count, 0),
        };
      });
      if (!created.conversation) {
        await get().loadConversations();
      }
      return realId;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.error('[chatStore] createPersonalChat (draft) error:', e.response?.data, e.message);
      } else {
        console.error('[chatStore] createPersonalChat (draft) error:', e);
      }
      emitAppToast('Не удалось начать диалог', 'error');
      return null;
    }
  },

  // ─── Send message (optimistic) ────────────────────────────

  sendMessage: async (conversationId, content, replyToId, payloadType = 'text', payload = {}) => {
    const convId = await get().promoteDraftToRealConversation(conversationId);
    if (convId == null) return;
    const textForSend = normalizeMentionsToCanonical(String(content ?? '').trim());
    playAudio('send');
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const serverReplyId =
      replyToId != null && /^\d+$/.test(String(replyToId)) ? replyToId : null;

    const pt: api.MessagePayloadType =
      payloadType === 'image' ||
      payloadType === 'file' ||
      payloadType === 'audio' ||
      payloadType === 'prayer_request' ||
      payloadType === 'poll'
        ? payloadType
        : 'text';

    const pollOptsLen =
      pt === 'poll' && Array.isArray((payload as { options?: unknown }).options)
        ? (payload as { options: unknown[] }).options.length
        : 0;

    // Optimistic: add temp message immediately
    const optimistic: MessageWithSender = {
      id: tempId,
      conversation_id: convId,
      sender_id: get().currentMemberId ?? null,
      client_msg_id: clientMsgId,
      content: textForSend,
      payload_type: pt,
      payload:
        pt === 'text'
          ? (() => {
              const mids = extractMentionMemberIdsFromText(textForSend);
              return mids.length ? { text: textForSend, mention_member_ids: mids } : { text: textForSend };
            })()
          : payload,
      poll_tallies: pt === 'poll' && pollOptsLen > 0 ? Array(pollOptsLen).fill(0) : undefined,
      poll_my_options: pt === 'poll' ? [] : undefined,
      interaction_count: 0,
      reply_to_message_id: replyToId || null,
      is_edited: false,
      is_deleted: false,
      status: 'sending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender_name: 'Вы',
      sender_first_name: null,
      sender_last_name: null,
      reply_preview: get().replyToMessage
        ? {
            id: get().replyToMessage!.id,
            content: get().replyToMessage!.content,
            sender_name: get().replyToMessage!.sender_name,
            is_deleted: get().replyToMessage!.is_deleted,
          }
        : null,
      reactions: [],
    };

    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: [...(s.messagesByConv[convId] || []), optimistic],
      },
      replyToMessage: null,
    }));

    try {
      const real = await api.sendMessage(convId, textForSend, serverReplyId, clientMsgId, pt, payload);
      // Replace temp with real and dedupe against WS echo by id/client_msg_id.
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [convId]: dedupeMessages(
            (s.messagesByConv[convId] || []).map((m) => (m.id === tempId ? { ...real, status: 'sent' } : m)),
          ),
        },
      }));
      saveSnapshot(get());
    } catch (e) {
      if (axios.isAxiosError(e)) {
        console.error('[chatStore] sendMessage error:', {
          status: e.response?.status,
          data: e.response?.data,
          message: e.message,
        });
      } else {
        console.error('[chatStore] sendMessage error:', e);
      }
      // Mark failed optimistic message
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [convId]: (s.messagesByConv[convId] || []).map((m) =>
            m.id === tempId ? { ...m, status: 'error' } : m,
          ),
        },
      }));
      // Фоновая очередь: при появлении сети уходит сама (pump + online).
      const queueId = `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const outboxItem: OutboxItem = {
        queueId,
        tempId,
        conversationId: convId,
        content: textForSend,
        replyToId: serverReplyId,
        clientMsgId,
        payloadType: pt,
        payload,
        createdAt: new Date().toISOString(),
      };
      enqueueOutbox(get, outboxItem);
      ensureOutboxPump(get);
    }
  },

  retrySendMessage: async (conversationId, tempId) => {
    const state = get();
    const list = state.messagesByConv[conversationId] || [];
    const msg = list.find((m) => m.id === tempId) || null;
    if (!msg || msg.status !== 'error') return;
    const pt = (msg.payload_type ?? 'text') as api.MessagePayloadType;
    const payload = (msg.payload ?? {}) as api.MessagePayload;
    const replyId =
      msg.reply_to_message_id != null && /^\d+$/.test(String(msg.reply_to_message_id))
        ? String(msg.reply_to_message_id)
        : null;
    const clientMsgId = msg.client_msg_id ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [conversationId]: (s.messagesByConv[conversationId] || []).map((m) =>
          m.id === tempId ? { ...m, status: 'sending', client_msg_id: clientMsgId } : m,
        ),
      },
    }));

    try {
      const real = await api.sendMessage(conversationId, msg.content ?? '', replyId, clientMsgId, pt, payload);
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [conversationId]: dedupeMessages(
            (s.messagesByConv[conversationId] || []).map((m) => (m.id === tempId ? { ...real, status: 'sent' } : m)),
          ),
        },
      }));
      // Remove from outbox if present.
      const q = inMemoryOutbox.find((x) => x.tempId === tempId) || null;
      if (q) {
        dequeueOutbox(get, q.queueId);
      }
      saveSnapshot(get());
    } catch (e) {
      console.error('[chatStore] retrySendMessage error:', e);
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [conversationId]: (s.messagesByConv[conversationId] || []).map((m) =>
            m.id === tempId ? { ...m, status: 'error' } : m,
          ),
        },
      }));
    }
  },

  // ─── Edit message ─────────────────────────────────────────

  editMessage: async (messageId, content) => {
    const state = get();
    const mid = String(messageId);
    const convId =
      findConversationIdContainingMessage(state.messagesByConv, mid) ?? state.activeConversationId;
    if (!convId) return;

    // Save original for rollback before any mutations
    const originalMsg = (state.messagesByConv[convId] || [])
      .find((m) => String(m.id) === mid) ?? null;

    const canonical = normalizeMentionsToCanonical(String(content ?? '').trim());

    // Optimistic edit
    set((s) => {
      const nextMsgs = (s.messagesByConv[convId] || []).map((m) =>
        String(m.id) === mid ? { ...m, content: canonical, is_edited: true } : m,
      );
      return {
        messagesByConv: { ...s.messagesByConv, [convId]: nextMsgs },
        conversations: syncConversationLastMessageOnEdit(s.conversations, convId, mid, canonical),
        editingMessage: null,
      };
    });

    try {
      await api.editMessage(messageId, canonical);
    } catch (e) {
      console.error('[chatStore] editMessage error:', e);
      // Granular rollback — restore only the affected message, no full reload
      if (originalMsg) {
        set((s) => ({
          messagesByConv: {
            ...s.messagesByConv,
            [convId]: (s.messagesByConv[convId] || []).map((m) =>
              String(m.id) === mid ? originalMsg : m,
            ),
          },
          conversations: syncConversationLastMessageOnEdit(
            s.conversations, convId, mid, originalMsg.content ?? '',
          ),
        }));
      }
      emitAppToast('Не удалось отредактировать сообщение', 'error');
    }
  },

  // ─── Delete message ───────────────────────────────────────

  deleteMessage: async (messageId) => {
    const state = get();
    const mid = String(messageId);
    const convId =
      findConversationIdContainingMessage(state.messagesByConv, mid) ?? state.activeConversationId;
    if (!convId) return;

    // Save original for rollback
    const originalMsg = (state.messagesByConv[convId] || [])
      .find((m) => String(m.id) === mid) ?? null;

    // Optimistic soft delete
    set((s) => {
      const nextMsgs = (s.messagesByConv[convId] || []).map((m) =>
        String(m.id) === mid ? { ...m, is_deleted: true, content: '' } : m,
      );
      return {
        messagesByConv: { ...s.messagesByConv, [convId]: nextMsgs },
        conversations: syncConversationLastMessageAfterMutation(
          s.conversations,
          convId,
          nextMsgs,
          mid,
        ),
      };
    });

    try {
      await api.deleteMessage(messageId);
    } catch (e) {
      console.error('[chatStore] deleteMessage error:', e);
      // Granular rollback — restore only the affected message
      if (originalMsg) {
        set((s) => {
          const restoredMsgs = (s.messagesByConv[convId] || []).map((m) =>
            String(m.id) === mid ? originalMsg : m,
          );
          return {
            messagesByConv: { ...s.messagesByConv, [convId]: restoredMsgs },
            conversations: syncConversationLastMessageAfterMutation(
              s.conversations, convId, restoredMsgs, mid,
            ),
          };
        });
      }
      emitAppToast('Не удалось удалить сообщение', 'error');
    }
  },

  // ─── Mark read ────────────────────────────────────────────

  markRead: async (conversationId) => {
    const msgs = get().messagesByConv[conversationId];
    if (!msgs || msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.id.startsWith('temp-')) return;

    await get().markReadUpTo(conversationId, lastMsg.id);
  },

  markAsRead: async (conversationId) => {
    // Always clear local counter immediately on open.
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
      totalUnread: Math.max(
        0,
        s.totalUnread -
          (s.conversations.find((c) => c.id === conversationId)?.unread_count ?? 0),
      ),
    }));
    // Best-effort: update server read cursor to the last known message.
    try {
      await get().markRead(conversationId);
    } catch (e) {
      console.error('[chatStore] markAsRead error:', e);
    }
  },

  markReadUpTo: async (conversationId, messageId) => {
    const normalizedId = String(messageId || '').trim();
    if (!/^\d+$/.test(normalizedId)) return;

    // Optimistic: set unread to 0
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
      totalUnread: Math.max(0, s.totalUnread - (s.conversations.find((c) => c.id === conversationId)?.unread_count ?? 0)),
    }));

    try {
      await api.markConversationRead(conversationId, normalizedId);
    } catch (e) {
      console.error('[chatStore] markReadUpTo error:', e);
    }
  },

  // ─── Reactions ────────────────────────────────────────────

  addReaction: async (messageId, emoji) => {
    const state = get();
    const me = state.currentMemberId;
    const convId = findConversationIdContainingMessage(state.messagesByConv, String(messageId));
    if (!convId || me == null) return;

    // Optimistic: add reaction immediately
    get().handleReaction(convId, String(messageId), emoji, me, 'add');

    try {
      await api.addReaction(messageId, emoji);
    } catch (e) {
      console.error('[chatStore] addReaction error:', e);
      // Rollback
      get().handleReaction(convId, String(messageId), emoji, me, 'remove');
      emitAppToast('Не удалось добавить реакцию', 'error');
    }
  },

  removeReaction: async (messageId, emoji) => {
    const state = get();
    const me = state.currentMemberId;
    const convId = findConversationIdContainingMessage(state.messagesByConv, String(messageId));
    if (!convId || me == null) return;

    // Optimistic: remove reaction immediately
    get().handleReaction(convId, String(messageId), emoji, me, 'remove');

    try {
      await api.removeReaction(messageId, emoji);
    } catch (e) {
      console.error('[chatStore] removeReaction error:', e);
      // Rollback
      get().handleReaction(convId, String(messageId), emoji, me, 'add');
      emitAppToast('Не удалось убрать реакцию', 'error');
    }
  },

  // ─── Reply / Edit state ───────────────────────────────────

  setReplyTo: (msg) => set({ replyToMessage: msg, editingMessage: null }),
  setReplyingTo: (msg) => set({ replyingTo: msg, editingMessage: null }),
  setEditing: (msg) => set({ editingMessage: msg, replyToMessage: null }),

  // ─── WS event handlers ───────────────────────────────────

  handleNewMessage: (convId, msg) => {
    const idKey = String(convId);
    const serverMsgId = String(msg.id);
    const state = get();
    const existingNow = state.messagesByConv[idKey] || [];
    const msgClientId = msg.client_msg_id ? String(msg.client_msg_id) : null;
    const isOwnNow =
      state.currentMemberId != null &&
      msg.sender_id != null &&
      Number(msg.sender_id) === Number(state.currentMemberId);
    const isProvisionalLocalId = (mid: string) =>
      mid.startsWith('temp-') || mid.startsWith('pending-');
    const alreadyPresent =
      existingNow.some((m) => String(m.id) === serverMsgId) ||
      (msgClientId != null &&
        existingNow.some(
          (m) => isProvisionalLocalId(String(m.id)) && m.client_msg_id === msgClientId,
        ));
    const shouldAutoReadNow =
      state.activeConversationId === idKey &&
      !isOwnNow &&
      /^\d+$/.test(serverMsgId) &&
      !alreadyPresent;
    if (!isOwnNow && !alreadyPresent) {
      playAudio('receive');
    }
    set((s) => {
      const existing = s.messagesByConv[idKey] || [];
      const isActiveConversation = s.activeConversationId === idKey;
      const isOwnMessage =
        s.currentMemberId != null &&
        msg.sender_id != null &&
        Number(msg.sender_id) === Number(s.currentMemberId);
      const shouldCountUnread =
        messageCountsAsUnreadForCurrentUser(msg, s.currentMemberId) && !isActiveConversation;
      const targetConversation = s.conversations.find((c) => c.id === idKey) || null;

      // Already present by definitive server id.
      if (existing.some((m) => String(m.id) === serverMsgId)) return s;

      // temp- / pending- с тем же client_msg_id заменяем на новый этап (WS раньше БД).
      const hasProvisionalTwin =
        msgClientId != null &&
        existing.some(
          (m) => isProvisionalLocalId(String(m.id)) && m.client_msg_id === msgClientId,
        );
      const merged = hasProvisionalTwin
        ? existing.map((m) =>
            isProvisionalLocalId(String(m.id)) && m.client_msg_id === msgClientId ? msg : m,
          )
        : [...existing, msg];
      const newMsgs = dedupeMessages(merged);

      // Update conversation list
      const updatedConvs = s.conversations.map((c) => {
        if (c.id !== idKey) return c;
        return {
          ...c,
          last_message: {
            id: serverMsgId,
            content: msg.content,
            sender_id: msg.sender_id,
            sender_name: msg.sender_name,
            created_at: msg.created_at,
            is_deleted: msg.is_deleted,
          },
          updated_at: msg.created_at,
          unread_count: shouldCountUnread ? c.unread_count + 1 : c.unread_count,
        };
      });

      // Sort by updated_at desc
      updatedConvs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const totalUnread = updatedConvs.reduce((sum, c) => sum + c.unread_count, 0);

      if (!isActiveConversation && !isOwnMessage) {
        const toastMeta = getConversationToastMeta(targetConversation, msg);
        emitAppToast({
          kind: 'info',
          title: toastMeta.title,
          avatarUrl: toastMeta.avatarUrl,
          avatarText: toastMeta.avatarText,
          message: truncateMessageForToast(msg.is_deleted ? 'Сообщение удалено' : msg.content),
          action: {
            event: 'app:open-conversation',
            detail: { conversationId: idKey },
          },
        });
      }

      return {
        messagesByConv: { ...s.messagesByConv, [idKey]: newMsgs },
        conversations: updatedConvs,
        totalUnread,
      };
    });

    // If user is currently inside this chat, sync read cursor immediately
    // so server-side unread_count does not drift.
    if (shouldAutoReadNow) {
      void get().markReadUpTo(idKey, serverMsgId);
    }
  },

  handleMessageSendFailed: (convId, clientMsgId) => {
    const idKey = String(convId);
    const cid = String(clientMsgId || '').trim();
    if (!cid) return;
    set((s) => {
      const list = s.messagesByConv[idKey] || [];
      const next = list.map((m) =>
        m.client_msg_id === cid &&
        (String(m.id).startsWith('temp-') || String(m.id).startsWith('pending-'))
          ? { ...m, status: 'error' as const }
          : m,
      );
      return { messagesByConv: { ...s.messagesByConv, [idKey]: next } };
    });
  },

  handleMessageEdited: (convId, msgId, content, updatedAt) => {
    const idKey = String(convId);
    const messageId = String(msgId);
    set((s) => {
      const nextMsgs = (s.messagesByConv[idKey] || []).map((m) =>
        String(m.id) === messageId ? { ...m, content, is_edited: true, updated_at: updatedAt } : m,
      );
      return {
        messagesByConv: { ...s.messagesByConv, [idKey]: nextMsgs },
        conversations: syncConversationLastMessageOnEdit(s.conversations, idKey, messageId, content),
      };
    });
  },

  handleMessagePayloadUpdated: (convId, msgId, payload, updatedAt) => {
    const idKey = String(convId);
    const messageId = String(msgId);
    set((s) => {
      const nextMsgs = (s.messagesByConv[idKey] || []).map((m) =>
        String(m.id) === messageId ? { ...m, payload, updated_at: updatedAt } : m,
      );
      return { messagesByConv: { ...s.messagesByConv, [idKey]: nextMsgs } };
    });
  },

  handleMessageDeleted: (convId, msgId) => {
    const idKey = String(convId);
    const messageId = String(msgId);
    set((s) => {
      const nextMsgs = (s.messagesByConv[idKey] || []).map((m) =>
        String(m.id) === messageId ? { ...m, is_deleted: true, content: '' } : m,
      );
      return {
        messagesByConv: { ...s.messagesByConv, [idKey]: nextMsgs },
        conversations: syncConversationLastMessageAfterMutation(
          s.conversations,
          idKey,
          nextMsgs,
          messageId,
        ),
      };
    });
  },

  handlePollTallies: (convId, messageId, tallies, myOptions) => {
    const idKey = String(convId);
    const mid = String(messageId);
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
          if (String(m.id) !== mid) return m;
          const next: MessageWithSender = { ...m, poll_tallies: [...tallies] };
          if (myOptions !== undefined) next.poll_my_options = [...myOptions];
          return next;
        }),
      },
    }));
  },

  votePoll: async (messageId, optionIndexes) => {
    const state = get();
    const mid = String(messageId);

    // Find message for optimistic update
    let convId: string | null = null;
    let originalTallies: number[] | undefined;
    let originalMyOptions: number[] | undefined;

    for (const [cid, msgs] of Object.entries(state.messagesByConv)) {
      const found = msgs.find((m) => String(m.id) === mid);
      if (found) {
        convId = cid;
        originalTallies = found.poll_tallies ? [...found.poll_tallies] : undefined;
        originalMyOptions = found.poll_my_options ? [...found.poll_my_options] : undefined;
        break;
      }
    }

    // Optimistic: increment counters immediately
    if (convId && originalTallies) {
      const optimisticTallies = [...originalTallies];
      for (const idx of optionIndexes) {
        if (optimisticTallies[idx] !== undefined) optimisticTallies[idx] += 1;
      }
      get().handlePollTallies(convId, messageId, optimisticTallies, optionIndexes);
    }

    try {
      const { tallies, my_options } = await api.votePoll(messageId, optionIndexes);
      // Replace optimistic with real data
      if (convId) {
        get().handlePollTallies(convId, messageId, tallies, my_options);
      }
    } catch (e) {
      // Rollback
      if (convId && originalTallies !== undefined) {
        get().handlePollTallies(convId, messageId, originalTallies, originalMyOptions);
      }
      if (axios.isAxiosError(e)) {
        const err = e.response?.data as { error?: string } | undefined;
        emitAppToast(err?.error ?? 'Не удалось сохранить голос', 'error');
      } else {
        emitAppToast('Не удалось сохранить голос', 'error');
      }
    }
  },

  handleReaction: (convId, msgId, emoji, memberId, action) => {
    const idKey = String(convId);
    const messageId = String(msgId);
    set((s) => {
      const me = s.currentMemberId;
      return {
        messagesByConv: {
          ...s.messagesByConv,
          [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
            if (String(m.id) !== messageId) return m;
            let reactions = [...m.reactions];
            const existingIdx = reactions.findIndex((r) => r.emoji === emoji);
            if (action === 'add') {
              if (existingIdx >= 0) {
                const prev = reactions[existingIdx];
                reactions[existingIdx] = {
                  ...prev,
                  count: prev.count + 1,
                  reacted_by_me: prev.reacted_by_me || memberId === me,
                };
              } else {
                reactions.push({ emoji, count: 1, reacted_by_me: memberId === me });
              }
            } else {
              if (existingIdx >= 0) {
                const prev = reactions[existingIdx];
                const newCount = prev.count - 1;
                const reactedByMe = memberId === me ? false : prev.reacted_by_me;
                if (newCount <= 0) {
                  reactions = reactions.filter((_, i) => i !== existingIdx);
                } else {
                  reactions[existingIdx] = { ...prev, count: newCount, reacted_by_me: reactedByMe };
                }
              }
            }
            return { ...m, reactions };
          }),
        },
      };
    });
  },

  bumpPinnedRevision: (conversationId) => {
    const k = String(conversationId);
    set((s) => ({
      pinnedBumpByConv: { ...s.pinnedBumpByConv, [k]: (s.pinnedBumpByConv[k] || 0) + 1 },
    }));
  },

  handleTypingStart: (convId, memberId, memberName) => {
    const idKey = String(convId);
    set((s) => {
      const existing = s.typingByConv[idKey] || [];
      // Clear existing timer for this member
      const old = existing.find((u) => u.memberId === memberId);
      if (old) clearTimeout(old.timer);
      // Auto-clear after 4s
      const timer = setTimeout(() => {
        get().handleTypingStop(idKey, memberId);
      }, 4000);
      const filtered = existing.filter((u) => u.memberId !== memberId);
      return {
        typingByConv: { ...s.typingByConv, [idKey]: [...filtered, { memberId, memberName, timer }] },
      };
    });
  },

  handleTypingStop: (convId, memberId) => {
    const idKey = String(convId);
    set((s) => {
      const existing = s.typingByConv[idKey] || [];
      const old = existing.find((u) => u.memberId === memberId);
      if (old) clearTimeout(old.timer);
      return {
        typingByConv: {
          ...s.typingByConv,
          [idKey]: existing.filter((u) => u.memberId !== memberId),
        },
      };
    });
  },

  handleConvCreated: (conv) => {
    const normalized = { ...conv, id: String(conv.id) };
    set((s) => {
      // Upsert: update if exists, add to front if new
      const exists = s.conversations.some((c) => c.id === normalized.id);
      const conversations = exists
        ? s.conversations.map((c) => c.id === normalized.id ? { ...c, ...normalized } : c)
        : [normalized, ...s.conversations];

      const om = normalized.other_member;
      const ls = om?.last_seen_at;
      const memberLastSeenAt =
        om && ls ? { ...s.memberLastSeenAt, [om.id]: ls } : s.memberLastSeenAt;
      return { conversations, memberLastSeenAt };
    });
  },

  handleConvUpdated: (convId, patch) => {
    set((s) => {
      const exists = s.conversations.some((c) => c.id === convId);
      if (!exists) return s;
      const conversations = s.conversations.map((c) =>
        c.id === convId ? { ...c, ...patch } : c,
      );
      return { conversations };
    });
  },

  handleReadUpdated: (convId, memberId, lastReadMsgId) => {
    const convKey = String(convId);
    const mid = Number(memberId);
    const msgId = String(lastReadMsgId ?? '').trim();
    if (!convKey || !Number.isFinite(mid) || mid <= 0 || !/^\d+$/.test(msgId)) {
      return;
    }

    const me = get().currentMemberId;

    if (me != null && Number(me) === mid) {
      // Own cursor — store separately, not in readCursorsByConv
      set((s) => {
        const prev = s.myReadCursorByConv[convKey];
        if (prev && /^\d+$/.test(prev) && BigInt(prev) >= BigInt(msgId)) return s;
        return {
          myReadCursorByConv: { ...s.myReadCursorByConv, [convKey]: msgId },
        };
      });
      return;
    }

    // Other people's cursors — for "read receipts" UI
    set((s) => {
      const existing = s.readCursorsByConv[convKey] || {};
      const prev = existing[mid];
      // Only move forward.
      if (prev && /^\d+$/.test(prev) && BigInt(prev) >= BigInt(msgId)) {
        return s;
      }
      return {
        readCursorsByConv: {
          ...s.readCursorsByConv,
          [convKey]: {
            ...existing,
            [mid]: msgId,
          },
        },
      };
    });
  },

  handlePresenceOnline: (memberId) => {
    set((s) => {
      const next = new Set(s.onlineMembers);
      next.add(memberId);
      return { onlineMembers: next };
    });
  },

  handlePresenceOffline: (memberId, lastSeenAt) => {
    set((s) => {
      const next = new Set(s.onlineMembers);
      next.delete(memberId);
      const memberLastSeenAt =
        lastSeenAt != null && String(lastSeenAt).trim() !== ''
          ? { ...s.memberLastSeenAt, [memberId]: String(lastSeenAt) }
          : s.memberLastSeenAt;
      return { onlineMembers: next, memberLastSeenAt };
    });
  },

  setOnlineMembers: (ids) => {
    set({ onlineMembers: new Set(ids) });
  },

  setCurrentMemberId: (id) => {
    const prev = get().currentMemberId;
    if (prev != null && prev !== id) {
      const currentTyping = get().typingByConv;
      clearAllTypingTimers(currentTyping);
      stopOutboxPump();
      inMemoryOutbox = [];
      set({ typingByConv: {}, memberLastSeenAt: {} });
    }
    set({ currentMemberId: id });
    // Кэш только при первом id или смене пользователя (не при каждом WS reconnect).
    if (prev == null || prev !== id) {
      hydrateFromCacheIntoStore(set, get);
    }
  },

  handleConvHistoryCleared: (conversationId) => {
    set((s) => {
      const conversations = s.conversations.map((c) =>
        c.id === conversationId ? { ...c, last_message: null, unread_count: 0 } : c,
      );
      const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      return {
        messagesByConv: { ...s.messagesByConv, [conversationId]: [] },
        conversations,
        totalUnread,
      };
    });
    saveSnapshot(get());
  },

  patchChatMyUi: async (conversationId, body) => {
    try {
      await api.patchMyConversationUi(conversationId, body);
      await get().loadConversations();
    } catch {
      emitAppToast('Не удалось сохранить настройки чата', 'error');
    }
  },

  clearChatHistory: async (conversationId) => {
    try {
      await api.clearConversationHistory(conversationId);
      get().handleConvHistoryCleared(conversationId);
      await get().loadConversations();
    } catch {
      emitAppToast('Не удалось очистить переписку', 'error');
    }
  },

  leaveChat: async (conversationId) => {
    const me = get().currentMemberId;
    if (me == null) return;
    try {
      await api.removeParticipant(conversationId, me);
      set((s) => {
        const conversations = s.conversations.filter((c) => c.id !== conversationId);
        const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
        const nextMsgs = { ...s.messagesByConv };
        delete nextMsgs[conversationId];
        return {
          conversations,
          totalUnread,
          messagesByConv: nextMsgs,
          activeConversationId:
            s.activeConversationId === conversationId ? null : s.activeConversationId,
        };
      });
      saveSnapshot(get());
    } catch {
      emitAppToast('Не удалось удалить чат', 'error');
    }
  },

  refreshUnread: async () => {
    try {
      const count = await api.fetchUnreadCount();
      set({ totalUnread: count });
    } catch {
      /* ignore */
    }
  },

  // ─── Search ───────────────────────────────────────────────

  searchMessages: async (query, conversationId) => {
    set({ searchLoading: true, searchQuery: query });
    try {
      const results = await api.searchMessages(conversationId, query, 50);
      set({ searchResults: results });
    } catch (e) {
      console.error('[chatStore] searchMessages error:', e);
      set({ searchResults: [] });
    } finally {
      set({ searchLoading: false });
    }
  },

  clearSearch: () => {
    set({ searchResults: [], searchQuery: '' });
  },

  searchAllConversations: async (query) => {
    if (!query.trim()) return;
    set({ globalSearchLoading: true });
    try {
      const results = await api.searchAllMessages(query, 30);
      set({ globalSearchResults: results });
    } catch (e) {
      console.error('[chatStore] searchAllConversations error:', e);
      set({ globalSearchResults: [] });
    } finally {
      set({ globalSearchLoading: false });
    }
  },

  clearGlobalSearch: () => {
    set({ globalSearchResults: [], searchQuery: '' });
  },

  // ─── Drafts ───────────────────────────────────────────────

  saveDraft: (conversationId, content) => {
    const drafts = { ...get().drafts };
    if (content.trim()) {
      drafts[conversationId] = content;
    } else {
      delete drafts[conversationId];
    }
    set({ drafts });
    // Persist to localStorage
    try {
      const userId = get().currentMemberId;
      if (userId) {
        localStorage.setItem(`messenger_drafts_${userId}`, JSON.stringify(drafts));
      }
    } catch {
      /* ignore localStorage errors */
    }
  },

  loadDrafts: () => {
    try {
      const userId = get().currentMemberId;
      if (!userId) return;
      const stored = localStorage.getItem(`messenger_drafts_${userId}`);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      // Validate: must be a flat object of strings
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.values(parsed).every((v) => typeof v === 'string')
      ) {
        set({ drafts: parsed as Record<string, string> });
      }
    } catch {
      /* ignore localStorage errors */
    }
  },

  clearDraft: (conversationId) => {
    const drafts = { ...get().drafts };
    delete drafts[conversationId];
    set({ drafts });
    try {
      const userId = get().currentMemberId;
      if (userId) {
        localStorage.setItem(`messenger_drafts_${userId}`, JSON.stringify(drafts));
      }
    } catch {
      /* ignore */
    }
  },
}));

// Auto-retry failed optimistic messages when network is back.
if (typeof window !== 'undefined' && !onlineRetryBound) {
  onlineRetryBound = true;
  window.addEventListener('online', () => {
    void (async () => {
      const getState = useChatStore.getState;
      await flushOutbox(getState);
      await runRetryAllFailed(getState);
    })();
  });
}

function classifyConversation(conv: ConversationListItem): Exclude<ChatTab, 'all'> {
  if (conv.my_ui_folder === 'personal') return 'personal';
  if (conv.my_ui_folder === 'ministry') return 'services';
  if (conv.type === 'private') return 'personal';
  if (conv.type === 'channel') return 'notifications';
  return 'services';
}

function truncateMessageForToast(content: string): string {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Новое сообщение';
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
}

function getConversationToastMeta(
  conversation: ConversationListItem | null,
  msg: MessageWithSender,
): { title: string; avatarUrl: string | null; avatarText: string } {
  if (conversation) {
    const title = getConversationTitle(conversation) || msg.sender_name || 'Новый чат';
    const avatarUrl =
      conversation.type === 'private'
        ? (conversation.other_member?.avatar_url ?? null)
        : (conversation.avatar_url ?? null);
    return {
      title,
      avatarUrl,
      avatarText: getAvatarFallback(title),
    };
  }

  const sender = msg.sender_name || msg.sender_first_name || 'Новое сообщение';
  return {
    title: sender,
    avatarUrl: null,
    avatarText: getAvatarFallback(sender),
  };
}

function getConversationTitle(conversation: ConversationListItem): string {
  if (conversation.type === 'private' && conversation.other_member) {
    const firstName = (conversation.other_member.first_name || '').trim();
    const lastName = (conversation.other_member.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || conversation.other_member.name || 'Личный чат';
  }
  return conversation.title || 'Групповой чат';
}

function getAvatarFallback(title: string): string {
  const text = String(title || '').trim();
  return (text.charAt(0) || '?').toUpperCase();
}

// Sync totalUnread to App Badge in compatible browsers
useChatStore.subscribe((state, prevState) => {
  if (state.totalUnread !== prevState.totalUnread) {
    if ('setAppBadge' in navigator && typeof navigator.setAppBadge === 'function') {
      if (state.totalUnread > 0) {
        navigator.setAppBadge(state.totalUnread).catch(() => { /* ignore */ });
      } else if (typeof navigator.clearAppBadge === 'function') {
        navigator.clearAppBadge().catch(() => { /* ignore */ });
      }
    }
  }
});
