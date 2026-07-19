import { create } from 'zustand';
import axios from 'axios';
import * as api from './api/messengerApi';
import {
  normalizeConversationListItem,
  type ConversationListItem,
  type ConversationListRow,
  type MessageWithSender,
  type SearchMember,
} from './api/messengerApi';
import { onAppBackgroundResume } from '../../lib/appBackgroundResume';
import { emitAppToast } from '../../lib/uiFeedback';
import { playAudio } from '../../utils/audio';
import { extractMentionMemberIdsFromText, normalizeMentionsToCanonical } from './mentionUtils';
import { normalizeChatDisplayText } from './normalizeChatDisplayText';
import { inferMessengerPayloadType } from './payloadMedia';
import {
  applyNewMessage,
  processMessengerWsBatch,
  runWsBatchEffects,
  type WsBatchEffect,
  type WsBatchRuntime,
  type WsInboundMessage,
} from './chatStoreWsBatch';

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

/** Дебаунс markReadUpTo при потоке входящих WS-сообщений — иначе сотни параллельных POST → ERR_INSUFFICIENT_RESOURCES. */
const markReadDebounceByConv = new Map<string, ReturnType<typeof setTimeout>>();
/** Один in-flight mark-read на чат + очередь последнего id, чтобы не плодить timeout'ы. */
const markReadInFlightByConv = new Map<string, bigint>();
const markReadQueuedByConv = new Map<string, bigint>();
const markReadCommittedByConv = new Map<string, bigint>();
/** Один in-flight vote на сообщение, защита от double-click. */
const pollVoteInFlightByMsg = new Set<string>();
/** Один in-flight reaction-запрос на пару message+emoji. */
const reactionInFlightByKey = new Set<string>();

/** Throttle: `ready` replay при каждом subscribeRealtimeMessages не должен ддосить API. */
let lastMessengerReadySyncAt = 0;
let convFallbackRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastConvFallbackRefreshAt = 0;

const wsTypingAutoStopTimers = new Map<string, ReturnType<typeof setTimeout>>();

function wsTypingTimerKey(convId: string, memberId: number): string {
  return `${convId}:${memberId}`;
}

function debouncedMarkReadUpTo(
  convId: string,
  msgId: string,
  fn: (c: string, m: string) => void,
  delayMs = 2000,
): void {
  const existing = markReadDebounceByConv.get(convId);
  if (existing) clearTimeout(existing);
  markReadDebounceByConv.set(
    convId,
    setTimeout(() => {
      markReadDebounceByConv.delete(convId);
      fn(convId, msgId);
    }, delayMs),
  );
}

function parseNumericMessageId(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function reactionRequestKey(messageId: string, emoji: string): string {
  return `${String(messageId)}::${String(emoji)}`;
}

/** Текст `error` из ответа API мессенджера (если есть). */
function messengerApiErrorText(e: unknown): string | null {
  if (!axios.isAxiosError(e)) return null;
  const data = e.response?.data as { error?: string } | undefined;
  const m = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : null;
  return m;
}

/** Чтобы фоновый outbox не спамил тостами при каждом 403. */
const retrySendForbiddenToastOnce = new Set<string>();

// ─── Types ────────────────────────────────────────────────────

interface TypingUser {
  memberId: number;
  memberName: string;
  /** Timeout ID to auto-clear */
  timer: ReturnType<typeof setTimeout>;
}

export interface ChatState {
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
  loadConversations: (opts?: { force?: boolean }) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  openPrivateDraft: (peer: SearchMember) => void;
  /** Deep link `draft:{memberId}` без peer в store — подтянуть карточку и открыть черновик ЛС. */
  ensurePrivateDraftFromConversationId: (conversationId: string) => Promise<boolean>;
  loadMessages: (conversationId: string, older?: boolean, opts?: { force?: boolean }) => Promise<void>;
  /** После reconnect: догрузить сообщения новее max(реальный id) без сброса истории. */
  catchUpMessagesAfter: (conversationId: string, retryCount?: number) => Promise<void>;
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
  ) => Promise<boolean>;
  retrySendMessage: (conversationId: string, tempId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
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

  /** WS: сервер подтвердил приём сообщения (до завершения записи в БД). */
  handleMsgServerAck: (convId: string, clientMsgId: string) => void;
  /** WS: получатель подтвердил доставку в свой клиент. */
  handleMsgDelivered: (convId: string, payload: { clientMsgId: string; messageId: string }) => void;

  /** WS: история чата очищена на сервере. */
  handleConvHistoryCleared: (conversationId: string) => void;
  patchChatMyUi: (conversationId: string, body: api.PatchMyConversationUiBody) => Promise<void>;
  clearChatHistory: (conversationId: string) => Promise<void>;
  leaveChat: (conversationId: string) => Promise<void>;

  refreshUnread: () => Promise<void>;

  /** Один set() на пачку WS-событий (см. useMessengerWs flush). */
  handleWsMessageBatch: (events: WsInboundMessage[]) => void;
}

export type ChatTab = 'all' | 'personal' | 'services' | 'notifications';

export const EMPTY_ARRAY: any[] = [];
export const EMPTY_OBJECT: any = {};

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
      cleanMessagesByConv[convId] = msgs.filter((m) => {
        const id = String(m.id);
        const provisional = id.startsWith('temp-') || id.startsWith('pending-');
        if (provisional) return m.status === 'error';
        return m.status !== 'sending';
      });
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

function buildMessageFromOutboxItem(item: OutboxItem, memberId: number | null): MessageWithSender {
  const pt = item.payloadType;
  const pollOptsLen =
    pt === 'poll' && Array.isArray((item.payload as { options?: unknown[] }).options)
      ? (item.payload as { options: unknown[] }).options.length
      : 0;

  return {
    id: item.tempId,
    conversation_id: item.conversationId,
    sender_id: memberId,
    client_msg_id: item.clientMsgId,
    content: item.content,
    payload_type: pt,
    payload:
      pt === 'text'
        ? (() => {
            const mids = extractMentionMemberIdsFromText(item.content);
            return mids.length
              ? { text: item.content, mention_member_ids: mids }
              : { text: item.content };
          })()
        : item.payload,
    poll_tallies: pt === 'poll' && pollOptsLen > 0 ? Array(pollOptsLen).fill(0) : undefined,
    poll_my_options: pt === 'poll' ? [] : undefined,
    interaction_count: 0,
    reply_to_message_id: item.replyToId,
    is_edited: false,
    is_deleted: false,
    status: 'error',
    created_at: item.createdAt,
    updated_at: item.createdAt,
    sender_name: 'Вы',
    sender_first_name: null,
    sender_last_name: null,
    reply_preview: null,
    reactions: [],
  };
}

function restoreOutboxMessagesIntoStore(
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
): void {
  if (inMemoryOutbox.length === 0) return;

  const state = get();
  const patch: Record<string, MessageWithSender[]> = {};
  let changed = false;

  for (const item of inMemoryOutbox) {
    const list = state.messagesByConv[item.conversationId] || [];
    if (list.some((m) => m.id === item.tempId)) continue;
    patch[item.conversationId] = [...(patch[item.conversationId] ?? list), buildMessageFromOutboxItem(item, state.currentMemberId)];
    changed = true;
  }

  if (!changed) return;

  set((s) => {
    const next = { ...s.messagesByConv };
    for (const [convId, msgs] of Object.entries(patch)) {
      next[convId] = msgs;
    }
    return { messagesByConv: next };
  });
}

async function sendOutboxItemDirectly(get: () => ChatState, item: OutboxItem): Promise<void> {
  const clientMsgId = item.clientMsgId?.trim() || newClientMsgId();
  const serverReplyId =
    item.replyToId != null && /^\d+$/.test(String(item.replyToId)) ? item.replyToId : null;

  try {
    const real = await api.sendMessage(
      item.conversationId,
      item.content,
      serverReplyId,
      clientMsgId,
      item.payloadType,
      item.payload,
    );
    dequeueOutbox(get, item.queueId);
    get().handleNewMessage(item.conversationId, { ...real, status: 'sent' });
    saveSnapshot(get());
    retrySendForbiddenToastOnce.delete(`${item.conversationId}\0${item.tempId}`);
  } catch (e) {
    console.error('[chatStore] sendOutboxItemDirectly error:', e);
    if (axios.isAxiosError(e) && e.response?.status === 403) {
      const dedupeKey = `${item.conversationId}\0${item.tempId}`;
      if (!retrySendForbiddenToastOnce.has(dedupeKey)) {
        retrySendForbiddenToastOnce.add(dedupeKey);
        emitAppToast(messengerApiErrorText(e) ?? 'Нет доступа к отправке в этот чат', 'error');
      }
    }
  }
}

async function retryOutboxItem(get: () => ChatState, item: OutboxItem): Promise<void> {
  const { conversationId, tempId } = item;
  const list = get().messagesByConv[conversationId] || [];
  const msg = list.find((m) => m.id === tempId) || null;

  if (!msg) {
    await sendOutboxItemDirectly(get, item);
    return;
  }

  if (msg.status !== 'error') {
    if (msg.status === 'sent' || msg.status === 'delivered') {
      dequeueOutbox(get, item.queueId);
    }
    return;
  }

  await get().retrySendMessage(conversationId, tempId);
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
    await retryOutboxItem(get, item);
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

function hydrateFromCacheIntoStore(
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) {
  const s = get();
  const snap = readSnapshot(s.currentMemberId);
  if (!snap) return;
  inMemoryOutbox = Array.isArray(snap.outbox) ? snap.outbox : [];
  const rawConversations = snap.conversations || [];
  const conversations = rawConversations.map((c) =>
    normalizeConversationListItem(c as ConversationListRow),
  );
  set({
    conversations,
    conversationsLoaded: conversations.length > 0,
    messagesByConv: snap.messagesByConv || {},
    hasMore: snap.hasMore || {},
    totalUnread: Number(snap.totalUnread || 0),
  });
  restoreOutboxMessagesIntoStore(set, get);
  ensureOutboxPump(get);

  // Outbox recovery: если вкладка только что открылась с уже накопленной очередью
  // (например, ОС выгрузила Safari PWA до того, как `window.online` успел выстрелить),
  // не ждём следующий 7-сек тик `outboxRetryTimer` — пробуем отправить сразу.
  // Гонка с логаутом исключена: `flushOutbox` идёт через microtask и проверяет
  // `navigator.onLine` перед каждой итерацией.
  if (
    inMemoryOutbox.length > 0 &&
    typeof navigator !== 'undefined' &&
    navigator.onLine !== false
  ) {
    queueMicrotask(() => {
      void flushOutbox(get);
    });
  }
}

function isProvisionalMessageId(mid: string): boolean {
  return mid.startsWith('temp-') || mid.startsWith('pending-');
}

/**
 * Дедуп по id и по client_msg_id. При совпадении client_msg_id оставляем «лучшую» копию:
 * сообщение с реальным numeric id важнее temp/pending (иначе при порядке [temp, real] из WS
 * отбрасывалось реальное и оставался temp до таймаута ACK / повторов).
 */
function dedupeMessages(messages: MessageWithSender[]): MessageWithSender[] {
  const canonicalByClient = new Map<string, MessageWithSender>();
  for (const msg of messages) {
    const ckRaw = msg.client_msg_id != null ? String(msg.client_msg_id).trim() : '';
    if (!ckRaw) continue;
    const prev = canonicalByClient.get(ckRaw);
    if (!prev) {
      canonicalByClient.set(ckRaw, msg);
      continue;
    }
    const pId = String(prev.id);
    const cId = String(msg.id);
    const pPr = isProvisionalMessageId(pId);
    const cPr = isProvisionalMessageId(cId);
    let chosen = prev;
    if (pPr && !cPr) chosen = msg;
    else if (!pPr && cPr) chosen = prev;
    else if (pPr && cPr) chosen = msg;
    else {
      try {
        if (/^\d+$/.test(pId) && /^\d+$/.test(cId) && BigInt(cId) > BigInt(pId)) chosen = msg;
      } catch {
        chosen = msg;
      }
    }
    canonicalByClient.set(ckRaw, chosen);
  }

  const byId = new Set<string>();
  const out: MessageWithSender[] = [];
  for (const msg of messages) {
    const idKey = String(msg.id);
    const ckRaw = msg.client_msg_id != null ? String(msg.client_msg_id).trim() : '';
    if (ckRaw) {
      const canonical = canonicalByClient.get(ckRaw);
      if (canonical && msg !== canonical) continue;
    }
    if (byId.has(idKey)) continue;
    byId.add(idKey);
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

function maxOtherReadCursor(cursorMap: Record<number, string> | undefined): bigint {
  if (!cursorMap) return 0n;
  let max = 0n;
  for (const v of Object.values(cursorMap)) {
    if (typeof v === 'string' && /^\d+$/.test(v)) {
      const b = BigInt(v);
      if (b > max) max = b;
    }
  }
  return max;
}

function listPreviewFromMessage(
  get: () => ChatState,
  convId: string,
  tail: MessageWithSender,
  opts?: { conversationsForPrev?: ConversationListItem[] },
): NonNullable<ConversationListItem['last_message']> {
  const pt = tail.payload_type ?? inferMessengerPayloadType(tail);
  let preview = String(tail.content ?? '').trim();
  if (!preview) {
    if (pt === 'audio') preview = '🎤 Голосовое сообщение';
    else if (pt === 'video_note') preview = '🎥 Видеосообщение';
    else if (pt === 'image') preview = '📷 Фото';
    else if (pt === 'file') preview = '📎 Файл';
    else if (pt === 'poll') preview = '📊 Опрос';
  }
  const st = get();
  const convList = opts?.conversationsForPrev ?? st.conversations;
  const me = st.currentMemberId;
  const isMine =
    me != null && tail.sender_id != null && Number(tail.sender_id) === Number(me);
  let read_by_others: boolean | undefined;
  if (isMine) {
    if (!/^\d+$/.test(String(tail.id))) {
      read_by_others = false;
    } else {
      const maxR = maxOtherReadCursor(st.readCursorsByConv[String(convId)]);
      const cursorRead = BigInt(String(tail.id)) <= maxR;
      const prev = convList.find((c) => String(c.id) === String(convId))?.last_message;
      const prevSameMsgRead =
        prev != null && String(prev.id) === String(tail.id) && prev.read_by_others === true;
      read_by_others = cursorRead || prevSameMsgRead;
    }
  }
  return {
    id: String(tail.id),
    content: preview,
    sender_id: tail.sender_id,
    sender_name: tail.sender_name,
    created_at: tail.created_at,
    is_deleted: tail.is_deleted,
    ...(read_by_others !== undefined ? { read_by_others } : {}),
  };
}

function moveConversationToTop(
  conversations: ConversationListItem[],
  conversationId: string,
  updater: (conv: ConversationListItem) => ConversationListItem,
): ConversationListItem[] {
  const idx = conversations.findIndex((c) => c.id === conversationId);
  if (idx < 0) return conversations;
  const updated = updater(conversations[idx]);
  if (idx === 0) {
    if (updated === conversations[0]) return conversations;
    const next = [...conversations];
    next[0] = updated;
    return next;
  }
  const next = [updated, ...conversations.slice(0, idx), ...conversations.slice(idx + 1)];
  return next;
}

/** Если правили/удалили текущее превью в списке чатов — обновить с учётом нового хвоста треда. */
function syncConversationLastMessageAfterMutation(
  get: () => ChatState,
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
    c.id === convId
      ? { ...c, last_message: listPreviewFromMessage(get, convId, tail, { conversationsForPrev: conversations }) }
      : c,
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

const SERVER_ACK_TIMEOUT_MS = 10_000;
const serverAckTimers = new Map<string, ReturnType<typeof setTimeout>>();

function serverAckKey(convId: string, clientMsgId: string): string {
  return `${convId}:${clientMsgId}`;
}

function clearServerAckTimer(convId: string, clientMsgId: string): void {
  const k = serverAckKey(convId, clientMsgId);
  const t = serverAckTimers.get(k);
  if (t != null) clearTimeout(t);
  serverAckTimers.delete(k);
}

function scheduleServerAckTimer(
  get: () => ChatState,
  convId: string,
  tempId: string,
  clientMsgId: string,
): void {
  const k = serverAckKey(convId, clientMsgId);
  const prev = serverAckTimers.get(k);
  if (prev != null) clearTimeout(prev);
  const t = setTimeout(() => {
    serverAckTimers.delete(k);
    const st = get();
    const list = st.messagesByConv[convId] || [];
    const hit = list.find(
      (m) =>
        String(m.client_msg_id || '') === clientMsgId &&
        m.id === tempId &&
        m.status === 'sending',
    );
    if (!hit) return;
    useChatStore.setState((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] || []).map((m) =>
          m.id === tempId && String(m.client_msg_id || '') === clientMsgId && m.status === 'sending'
            ? { ...m, status: 'error' as const }
            : m,
        ),
      },
    }));
  }, SERVER_ACK_TIMEOUT_MS);
  serverAckTimers.set(k, t);
}

function newClientMsgId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

  loadConversations: async (opts) => {
    const force = opts?.force === true;
    if (get().conversationsLoading) return;
    // Guard against rapid refetch loops (WS flaps / repeated events).
    // Skip cooldown after reconnect (`force`) so список чатов не «залипает» после восстановления WS.
    if (
      !force &&
      Date.now() - (get().conversationsLastLoadedAt || 0) < 1500
    ) {
      return;
    }
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
        emitAppToast({
          message: 'Нет соединения. Показываем кэшированные данные.',
          kind: 'info',
          adminOnly: true,
        });
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
      replyingTo: null,
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
      replyingTo: null,
      editingMessage: null,
      messagesByConv: {
        ...s.messagesByConv,
        [draftId]: s.messagesByConv[draftId] || [],
      },
      hasMore: { ...s.hasMore, [draftId]: false },
    }));
  },

  ensurePrivateDraftFromConversationId: async (conversationId) => {
    const memberId = parseDraftPrivateMemberId(conversationId);
    if (memberId == null) return false;
    const existing = get().privateDraftPeer;
    if (existing && Number(existing.id) === memberId) {
      get().openPrivateDraft(existing);
      return true;
    }
    const peer = await api.fetchMessengerMember(memberId);
    if (!peer) {
      emitAppToast('Не удалось открыть чат с участником', 'error');
      return false;
    }
    get().openPrivateDraft(peer);
    return true;
  },

  // ─── Load messages ────────────────────────────────────────

  loadMessages: async (conversationId, older = false, opts) => {
    const force = opts?.force === true;
    if (isDraftPrivateConversationId(conversationId)) return;
    const state = get();
    if (state.messagesLoading[conversationId]) return;
    if (!older && !force) {
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
        const prev = s.messagesByConv[conversationId] || [];
        const merged = older ? [...messages, ...prev] : [...prev, ...messages];
        // Keep the same dedupe policy as optimistic/WS merge and keep stable numeric order.
        const deduped = dedupeMessages(merged);
        const sorted = sortMessagesByNumericIdAsc(deduped);

        return {
          messagesByConv: { ...s.messagesByConv, [conversationId]: sorted },
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

  catchUpMessagesAfter: async (conversationId, retryCount = 0) => {
    if (isDraftPrivateConversationId(conversationId)) return;
    const state = get();
    if (state.messagesLoading[conversationId]) {
      // Не терять догрузку после reconnect, если параллельно идёт loadMessages из ChatWindow.
      if (retryCount < 12) {
        await new Promise((r) => setTimeout(r, 100));
        return get().catchUpMessagesAfter(conversationId, retryCount + 1);
      }
      return;
    }

    const existing = state.messagesByConv[conversationId] || [];
    const afterSeed = maxRealServerMessageId(existing);
    if (afterSeed == null) {
      set((s) => ({
        messagesLastLoadedAt: { ...s.messagesLastLoadedAt, [conversationId]: 0 },
      }));
      await get().loadMessages(conversationId, false, { force: true });
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
        await get().loadConversations({ force: true });
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
    if (convId == null) return false;
    const textForSend = normalizeMentionsToCanonical(
      normalizeChatDisplayText(String(content ?? '').trim()),
    );
    playAudio('send');
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientMsgId = newClientMsgId();
    const serverReplyId =
      replyToId != null && /^\d+$/.test(String(replyToId)) ? replyToId : null;

    const pt: api.MessagePayloadType =
      payloadType === 'image' ||
      payloadType === 'file' ||
      payloadType === 'audio' ||
      payloadType === 'video_note' ||
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
      reply_preview: (() => {
        const replySrc = get().replyingTo ?? get().replyToMessage;
        return replySrc
          ? {
              id: replySrc.id,
              content: replySrc.content,
              sender_name: replySrc.sender_name,
              is_deleted: replySrc.is_deleted,
            }
          : null;
      })(),
      reactions: [],
    };

    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: [...(s.messagesByConv[convId] || []), optimistic],
      },
      conversations: moveConversationToTop(s.conversations, convId, (c) => ({
        ...c,
        last_message: listPreviewFromMessage(get, convId, optimistic, { conversationsForPrev: s.conversations }),
        updated_at: optimistic.created_at,
      })),
    }));

    scheduleServerAckTimer(get, convId, tempId, clientMsgId);

    try {
      const real = await api.sendMessage(convId, textForSend, serverReplyId, clientMsgId, pt, payload);
      clearServerAckTimer(convId, clientMsgId);
      // Replace temp with real and dedupe against WS echo by id/client_msg_id.
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [convId]: dedupeMessages(
            (s.messagesByConv[convId] || []).map((m) => {
              const match =
                m.id === tempId ||
                (String(m.client_msg_id || '') === clientMsgId &&
                  (String(m.id).startsWith('temp-') || m.status === 'error'));
              if (!match) return m;
              const keepStatus = m.status === 'delivered' ? 'delivered' : ('sent' as const);
              return { ...real, status: keepStatus };
            }),
          ),
        },
        conversations: moveConversationToTop(s.conversations, convId, (c) => ({
          ...c,
          last_message: listPreviewFromMessage(get, convId, real, { conversationsForPrev: s.conversations }),
          updated_at: real.created_at,
        })),
        replyToMessage: null,
        replyingTo: null,
      }));
      saveSnapshot(get());
      return true;
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
      const apiErr = messengerApiErrorText(e);
      emitAppToast(apiErr ?? 'Не удалось отправить сообщение', 'error');
      clearServerAckTimer(convId, clientMsgId);
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
      return false;
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
    const clientMsgId = msg.client_msg_id?.trim() || newClientMsgId();

    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [conversationId]: (s.messagesByConv[conversationId] || []).map((m) =>
          m.id === tempId ? { ...m, status: 'sending', client_msg_id: clientMsgId } : m,
        ),
      },
    }));

    scheduleServerAckTimer(get, conversationId, tempId, clientMsgId);

    try {
      const real = await api.sendMessage(conversationId, msg.content ?? '', replyId, clientMsgId, pt, payload);
      clearServerAckTimer(conversationId, clientMsgId);
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [conversationId]: dedupeMessages(
            (s.messagesByConv[conversationId] || []).map((m) => {
              if (m.id !== tempId) return m;
              const keepStatus = m.status === 'delivered' ? 'delivered' : ('sent' as const);
              return { ...real, status: keepStatus };
            }),
          ),
        },
        conversations: moveConversationToTop(s.conversations, conversationId, (c) => ({
          ...c,
          last_message: listPreviewFromMessage(get, conversationId, real, {
            conversationsForPrev: s.conversations,
          }),
          updated_at: real.created_at,
        })),
      }));
      // Remove from outbox if present.
      const q = inMemoryOutbox.find((x) => x.tempId === tempId) || null;
      if (q) {
        dequeueOutbox(get, q.queueId);
      }
      saveSnapshot(get());
      retrySendForbiddenToastOnce.delete(`${conversationId}\0${tempId}`);
    } catch (e) {
      console.error('[chatStore] retrySendMessage error:', e);
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        const dedupeKey = `${conversationId}\0${tempId}`;
        if (!retrySendForbiddenToastOnce.has(dedupeKey)) {
          retrySendForbiddenToastOnce.add(dedupeKey);
          emitAppToast(messengerApiErrorText(e) ?? 'Нет доступа к отправке в этот чат', 'error');
        }
      }
      clearServerAckTimer(conversationId, clientMsgId);
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
    if (!convId) return false;

    // Save original for rollback before any mutations
    const originalMsg = (state.messagesByConv[convId] || [])
      .find((m) => String(m.id) === mid) ?? null;

    const canonical = normalizeMentionsToCanonical(
      normalizeChatDisplayText(String(content ?? '').trim()),
    );

    // Optimistic edit (режим редактирования в инпуте сохраняем до успешного ответа API)
    set((s) => {
      const nextMsgs = (s.messagesByConv[convId] || []).map((m) =>
        String(m.id) === mid ? { ...m, content: canonical, is_edited: true } : m,
      );
      const em =
        s.editingMessage && String(s.editingMessage.id) === mid
          ? { ...s.editingMessage, content: canonical, is_edited: true }
          : s.editingMessage;
      return {
        messagesByConv: { ...s.messagesByConv, [convId]: nextMsgs },
        conversations: syncConversationLastMessageOnEdit(s.conversations, convId, mid, canonical),
        editingMessage: em,
      };
    });

    try {
      await api.editMessage(messageId, canonical);
      set((s) =>
        s.editingMessage && String(s.editingMessage.id) === mid ? { editingMessage: null } : {},
      );
      return true;
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
          editingMessage:
            s.editingMessage && String(s.editingMessage.id) === mid ? originalMsg : s.editingMessage,
        }));
      }
      emitAppToast('Не удалось отредактировать сообщение', 'error');
      return false;
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
          get,
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
              get, s.conversations, convId, restoredMsgs, mid,
            ),
          };
        });
      }
      emitAppToast('Не удалось удалить сообщение', 'error');
    }
  },

  // ─── Mark read ────────────────────────────────────────────

  markRead: async (conversationId) => {
    if (!conversationId) return;
    const msgs = get().messagesByConv[conversationId];
    if (!msgs || msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    const lastMsgId = String(lastMsg?.id ?? '').trim();
    if (!/^\d+$/.test(lastMsgId)) return;

    await get().markReadUpTo(conversationId, lastMsgId);
  },

  markAsRead: async (conversationId) => {
    if (!conversationId) return;
    const msgs = get().messagesByConv[conversationId] || [];
    if (msgs.length === 0) return;
    const latestNumericMessageId = (() => {
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const id = String(msgs[i]?.id ?? '').trim();
        if (/^\d+$/.test(id)) return id;
      }
      return null;
    })();
    if (!latestNumericMessageId) return;
    const myReadCursor = String(get().myReadCursorByConv[conversationId] ?? '').trim();
    if (/^\d+$/.test(myReadCursor) && BigInt(myReadCursor) >= BigInt(latestNumericMessageId)) {
      // После reconnect не дублируем markRead, если курсор уже зафиксирован ранее.
      return;
    }

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
    // Best-effort: update server read cursor immediately.
    try {
      await api.markConversationRead(conversationId, {
        messageId: latestNumericMessageId,
        readAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[chatStore] markAsRead error:', e);
    }
  },

  markReadUpTo: async (conversationId, messageId) => {
    const normalizedId = String(messageId || '').trim();
    const targetId = parseNumericMessageId(normalizedId);
    if (targetId == null) return;
    const convKey = String(conversationId);
    const committed = markReadCommittedByConv.get(convKey) ?? 0n;
    if (targetId <= committed) return;

    const inFlight = markReadInFlightByConv.get(convKey);
    if (inFlight != null) {
      const prevQueued = markReadQueuedByConv.get(convKey) ?? 0n;
      if (targetId > prevQueued) {
        markReadQueuedByConv.set(convKey, targetId);
      }
      return;
    }

    // Optimistic: set unread to 0
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
      totalUnread: Math.max(0, s.totalUnread - (s.conversations.find((c) => c.id === conversationId)?.unread_count ?? 0)),
    }));

    markReadInFlightByConv.set(convKey, targetId);
    try {
      await api.markConversationRead(conversationId, { messageId: normalizedId });
      const prevCommitted = markReadCommittedByConv.get(convKey) ?? 0n;
      if (targetId > prevCommitted) {
        markReadCommittedByConv.set(convKey, targetId);
      }
    } catch (e) {
      if (axios.isAxiosError(e) && (e.code === 'ECONNABORTED' || e.message.includes('timeout'))) {
        // Не шумим в консоли на временных сетевых лагax — следующий flush/read-up событие догонит.
        return;
      }
      console.error('[chatStore] markReadUpTo error:', e);
    } finally {
      markReadInFlightByConv.delete(convKey);
      const queued = markReadQueuedByConv.get(convKey);
      if (queued != null) {
        markReadQueuedByConv.delete(convKey);
        const latestCommitted = markReadCommittedByConv.get(convKey) ?? 0n;
        if (queued > latestCommitted) {
          void get().markReadUpTo(convKey, String(queued));
        }
      }
    }
  },

  // ─── Reactions ────────────────────────────────────────────

  addReaction: async (messageId, emoji) => {
    const state = get();
    const me = state.currentMemberId;
    const convId = findConversationIdContainingMessage(state.messagesByConv, String(messageId));
    if (!convId || me == null) return;
    const reqKey = reactionRequestKey(messageId, emoji);
    if (reactionInFlightByKey.has(reqKey)) return;
    reactionInFlightByKey.add(reqKey);

    // Optimistic: add reaction immediately
    get().handleReaction(convId, String(messageId), emoji, me, 'add');

    try {
      await api.addReaction(messageId, emoji);
    } catch (e) {
      console.error('[chatStore] addReaction error:', e);
      // Rollback
      get().handleReaction(convId, String(messageId), emoji, me, 'remove');
      emitAppToast('Не удалось добавить реакцию', 'error');
    } finally {
      reactionInFlightByKey.delete(reqKey);
    }
  },

  removeReaction: async (messageId, emoji) => {
    const state = get();
    const me = state.currentMemberId;
    const convId = findConversationIdContainingMessage(state.messagesByConv, String(messageId));
    if (!convId || me == null) return;
    const reqKey = reactionRequestKey(messageId, emoji);
    if (reactionInFlightByKey.has(reqKey)) return;
    reactionInFlightByKey.add(reqKey);

    // Optimistic: remove reaction immediately
    get().handleReaction(convId, String(messageId), emoji, me, 'remove');

    try {
      await api.removeReaction(messageId, emoji);
    } catch (e) {
      console.error('[chatStore] removeReaction error:', e);
      // Rollback
      get().handleReaction(convId, String(messageId), emoji, me, 'add');
      emitAppToast('Не удалось убрать реакцию', 'error');
    } finally {
      reactionInFlightByKey.delete(reqKey);
    }
  },

  // ─── Reply / Edit state ───────────────────────────────────

  setReplyTo: (msg) => set({ replyToMessage: msg, replyingTo: null, editingMessage: null }),
  setReplyingTo: (msg) => set({ replyingTo: msg, replyToMessage: null, editingMessage: null }),
  setEditing: (msg) => set({ editingMessage: msg, replyToMessage: null, replyingTo: null }),

  // ─── WS event handlers ───────────────────────────────────

  handleNewMessage: (convId, incoming) => {
    const effects: WsBatchEffect[] = [];
    set((s) => applyNewMessage(s, String(convId), incoming, effects));
    runWsBatchEffects(effects, createWsBatchRuntime(get, set));
  },

  handleMessageSendFailed: (convId, clientMsgId) => {
    const idKey = String(convId);
    const cid = String(clientMsgId || '').trim();
    if (!cid) return;
    clearServerAckTimer(idKey, cid);
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

  handleMsgServerAck: (convId, clientMsgId) => {
    const idKey = String(convId);
    const c = String(clientMsgId || '').trim();
    if (!c) return;
    clearServerAckTimer(idKey, c);
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
          if (String(m.client_msg_id || '') !== c) return m;
          const prov =
            String(m.id).startsWith('temp-') ||
            String(m.id).startsWith('pending-') ||
            m.status === 'sending';
          if (!prov) return m;
          return { ...m, status: 'sent' as const };
        }),
      },
    }));
  },

  handleMsgDelivered: (convId, payload) => {
    const idKey = String(convId);
    const c = String(payload.clientMsgId || '').trim();
    const mid = String(payload.messageId || '').trim();
    if (!c && !mid) return;
    set((s) => {
      const me = s.currentMemberId;
      const list = s.messagesByConv[idKey] || [];
      const next = list.map((m) => {
        if (me == null || m.sender_id == null || Number(m.sender_id) !== Number(me)) return m;
        const match =
          (c && String(m.client_msg_id || '') === c) || (mid && String(m.id) === mid);
        if (!match) return m;
        if (m.status === 'error' || m.status === 'sending') return m;
        return { ...m, status: 'delivered' as const };
      });
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
          get,
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
    if (pollVoteInFlightByMsg.has(mid)) return;
    pollVoteInFlightByMsg.add(mid);

    let convId: string | null = null;
    /** Снимок до оптимистичного UI (для отката и корректного пересчёта) */
    let preTallies: number[] | null = null;
    let preMy: number[] | null = null;

    for (const [cid, msgs] of Object.entries(state.messagesByConv)) {
      const found = msgs.find((m) => String(m.id) === mid);
      if (!found) continue;
      const optLen =
        found.payload_type === 'poll' &&
        found.payload &&
        typeof found.payload === 'object' &&
        !Array.isArray(found.payload) &&
        Array.isArray((found.payload as { options?: unknown }).options)
          ? (found.payload as { options: unknown[] }).options.length
          : 0;
      if (optLen < 1) break;
      convId = cid;
      preMy = found.poll_my_options ? [...found.poll_my_options] : [];
      preTallies =
        found.poll_tallies && found.poll_tallies.length === optLen
          ? [...found.poll_tallies]
          : Array.from({ length: optLen }, () => 0);
      const optimisticTallies = [...preTallies];
      for (const j of preMy) {
        if (typeof optimisticTallies[j] === 'number' && optimisticTallies[j] > 0) {
          optimisticTallies[j] -= 1;
        }
      }
      for (const idx of optionIndexes) {
        if (optimisticTallies[idx] !== undefined) optimisticTallies[idx] += 1;
      }
      get().handlePollTallies(convId, messageId, optimisticTallies, optionIndexes);
      break;
    }

    try {
      const { tallies, my_options } = await api.votePoll(messageId, optionIndexes);
      // Replace optimistic with real data
      if (convId) {
        get().handlePollTallies(convId, messageId, tallies, my_options);
      }
    } catch (e) {
      if (convId && preTallies) {
        get().handlePollTallies(convId, messageId, [...preTallies], preMy ?? []);
      }
      if (axios.isAxiosError(e)) {
        const err = e.response?.data as { error?: string } | undefined;
        emitAppToast(err?.error ?? 'Не удалось сохранить голос', 'error');
      } else {
        emitAppToast('Не удалось сохранить голос', 'error');
      }
    } finally {
      pollVoteInFlightByMsg.delete(mid);
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
                // Idempotency for own reactions:
                // local optimistic "add" may already be applied before WS echo arrives.
                if (memberId === me && prev.reacted_by_me) {
                  return m;
                }
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
                // Idempotency for own reactions:
                // local optimistic "remove" may already be applied before WS echo arrives.
                if (memberId === me && !prev.reacted_by_me) {
                  return m;
                }
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
    const normalized = normalizeConversationListItem({ ...conv, id: String(conv.id) } as ConversationListRow);
    set((s) => {
      // Upsert: update if exists, add to front if new
      const exists = s.conversations.some((c) => String(c.id) === normalized.id);
      const conversations = exists
        ? s.conversations.map((c) => (String(c.id) === normalized.id ? { ...c, ...normalized } : c))
        : [normalized, ...s.conversations];

      const om = normalized.other_member;
      const ls = om?.last_seen_at;
      const memberLastSeenAt =
        om && ls ? { ...s.memberLastSeenAt, [om.id]: ls } : s.memberLastSeenAt;
      return { conversations, memberLastSeenAt };
    });
  },

  handleConvUpdated: (convId, patch) => {
    const idKey = String(convId);
    set((s) => {
      const exists = s.conversations.some((c) => String(c.id) === idKey);
      if (!exists) return s;
      const normalizedPatch: Partial<ConversationListItem> & { avatarUrl?: string | null } = {
        ...(patch as Partial<ConversationListItem>),
      };
      if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'avatarUrl')) {
        normalizedPatch.avatar_url = normalizedPatch.avatarUrl ?? null;
        delete normalizedPatch.avatarUrl;
      }
      const conversations = s.conversations.map((c) => {
        if (String(c.id) !== idKey) return c;
        const merged = { ...c, ...normalizedPatch } as ConversationListRow;
        return normalizeConversationListItem(merged);
      });
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
      await get().loadConversations({ force: true });
    } catch {
      emitAppToast('Не удалось сохранить настройки чата', 'error');
    }
  },

  clearChatHistory: async (conversationId) => {
    try {
      await api.clearConversationHistory(conversationId);
      get().handleConvHistoryCleared(conversationId);
      await get().loadConversations({ force: true });
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
      // refreshUnread updates only aggregate badge; while messenger screen is open
      // we also sync per-chat unread_count values in the conversation list.
      if (isMessengerRouteActive()) {
        await get().loadConversations({ force: true });
      }
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
    // Не трогаем `searchQuery` — он общий с поиском по текущему чату (`searchMessages`).
    set({ globalSearchResults: [], globalSearchLoading: false });
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

  handleWsMessageBatch: (events) => {
    processMessengerWsBatch(events, set, createWsBatchRuntime(get, set));
  },
}));

type ChatStoreApi = ReturnType<typeof useChatStore.getState>;

function createWsBatchRuntime(
  get: () => ChatStoreApi,
  set: (
    partial:
      | Partial<ChatState>
      | ((state: ChatState) => Partial<ChatState> | ChatState),
  ) => void,
): WsBatchRuntime {
  return {
    get,
    debouncedMarkReadUpTo,
    clearServerAckTimer,
    scheduleConversationsFallbackRefresh: (force) => {
      const now = Date.now();
      const minGapMs = 1500;
      if (!force && now - lastConvFallbackRefreshAt < minGapMs) return;
      if (convFallbackRefreshTimer != null) return;
      convFallbackRefreshTimer = setTimeout(() => {
        convFallbackRefreshTimer = null;
        lastConvFallbackRefreshAt = Date.now();
        void get().loadConversations({ force });
      }, 120);
    },
    shouldSyncConversationsOnReady: () => Date.now() - lastMessengerReadySyncAt >= 2500,
    markReadySyncDone: () => {
      lastMessengerReadySyncAt = Date.now();
    },
    armTypingAutoStop: (convId, memberId, onStop) => {
      const key = wsTypingTimerKey(convId, memberId);
      const prev = wsTypingAutoStopTimers.get(key);
      if (prev != null) clearTimeout(prev);
      wsTypingAutoStopTimers.set(
        key,
        setTimeout(() => {
          wsTypingAutoStopTimers.delete(key);
          onStop();
        }, 4000),
      );
    },
    clearTypingTimer: (convId, memberId) => {
      const key = wsTypingTimerKey(convId, memberId);
      const prev = wsTypingAutoStopTimers.get(key);
      if (prev != null) clearTimeout(prev);
      wsTypingAutoStopTimers.delete(key);
    },
    hydrateCacheIfNewMember: (memberId, prevMemberId) => {
      if (prevMemberId != null && prevMemberId !== memberId) {
        clearAllTypingTimers(get().typingByConv);
        stopOutboxPump();
        inMemoryOutbox = [];
        set({ typingByConv: {}, memberLastSeenAt: {} });
      }
      if (prevMemberId == null || prevMemberId !== memberId) {
        hydrateFromCacheIntoStore(set, get);
      }
    },
    saveSnapshot: () => saveSnapshot(get()),
  };
}

async function drainPendingMessengerQueue(get: () => ChatState): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  await flushOutbox(get);
  await runRetryAllFailed(get);
}

function refreshMessengerAfterResume(get: () => ChatState): void {
  const state = get();
  if (!state.currentMemberId) return;
  if (state.conversationsLoaded || state.conversations.length > 0) {
    void state.loadConversations();
  }
}

// Auto-retry failed messages when network is back or app returns to foreground (iOS PWA).
if (typeof window !== 'undefined' && !onlineRetryBound) {
  onlineRetryBound = true;
  onAppBackgroundResume(() => {
    const getState = useChatStore.getState;
    void drainPendingMessengerQueue(getState);
    refreshMessengerAfterResume(getState);
  });
}

function classifyConversation(conv: ConversationListItem): Exclude<ChatTab, 'all'> {
  if (conv.my_ui_folder === 'personal') return 'personal';
  if (conv.my_ui_folder === 'ministry') return 'services';
  if (conv.type === 'private') return 'personal';
  if (conv.type === 'channel') return 'notifications';
  return 'services';
}

function isMessengerRouteActive(): boolean {
  if (typeof window === 'undefined') return false;
  const path = String(window.location?.pathname ?? '');
  return path === '/messenger' || path.startsWith('/messenger/');
}

