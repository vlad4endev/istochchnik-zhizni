import { create } from 'zustand';
import axios from 'axios';
import type { ConversationListItem, MessageWithSender } from './api/messengerApi';
import * as api from './api/messengerApi';
import { emitAppToast } from '../../lib/uiFeedback';
import { playAudio } from '../../utils/audio';

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

  // --- Active chat ---
  activeConversationId: string | null;

  // --- Messages cache: conversationId → messages ---
  messagesByConv: Record<string, MessageWithSender[]>;
  messagesLoading: Record<string, boolean>;
  /** True means there are older messages to load */
  hasMore: Record<string, boolean>;

  // --- Read cursors (read receipts) ---
  /** conversationId -> memberId -> lastReadMessageId */
  readCursorsByConv: Record<string, Record<number, string>>;

  // --- Typing indicator: convId → memberId[] ---
  typingByConv: Record<string, TypingUser[]>;

  // --- Online presence ---
  onlineMembers: Set<number>;

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

  // --- Drafts ---
  drafts: Record<string, string>;
  saveDraft: (conversationId: string, content: string) => void;
  loadDrafts: () => void;
  clearDraft: (conversationId: string) => void;

  // --- Actions ---
  loadConversations: () => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  loadMessages: (conversationId: string, older?: boolean) => Promise<void>;

  /** Optimistic send: message appears instantly, then confirmed by server */
  sendMessage: (
    conversationId: string,
    content: string,
    replyToId?: string | null,
    payloadType?: api.MessagePayloadType,
    payload?: api.MessagePayload,
  ) => Promise<void>;
  retrySendMessage: (conversationId: string, tempId: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
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

  // --- WS event handlers (called by messengerWs hook) ---
  handleNewMessage: (convId: string, msg: MessageWithSender) => void;
  handleMessageEdited: (convId: string, msgId: string, content: string, updatedAt: string) => void;
  handleMessageDeleted: (convId: string, msgId: string) => void;
  handleReaction: (convId: string, msgId: string, emoji: string, memberId: number, action: 'add' | 'remove') => void;
  handleTypingStart: (convId: string, memberId: number, memberName: string) => void;
  handleTypingStop: (convId: string, memberId: number) => void;
  handleConvCreated: (conv: ConversationListItem) => void;
  handleReadUpdated: (convId: string, memberId: number, lastReadMsgId: string) => void;
  handlePresenceOnline: (memberId: number) => void;
  handlePresenceOffline: (memberId: number) => void;
  setOnlineMembers: (ids: number[]) => void;
  setCurrentMemberId: (id: number) => void;

  refreshUnread: () => Promise<void>;
}

export type ChatTab = 'all' | 'personal' | 'services' | 'notifications';

export const EMPTY_ARRAY: any[] = [];
export const EMPTY_OBJECT: any = {};

let onlineRetryBound = false;
let retryInFlight = false;

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

// ─── Store ────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  currentMemberId: null,
  conversations: [],
  conversationsLoaded: false,
  conversationsLoading: false,
  activeConversationId: null,
  messagesByConv: {},
  messagesLoading: {},
  hasMore: {},
  readCursorsByConv: {},
  typingByConv: {},
  onlineMembers: new Set(),
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
  drafts: {},

  // ─── Load conversations ───────────────────────────────────

  loadConversations: async () => {
    if (get().conversationsLoading) return;
    set({ conversationsLoading: true });
    try {
      const conversations = await api.fetchConversations();
      const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);
      set({ conversations, conversationsLoaded: true, totalUnread });
    } catch (e) {
      console.error('[chatStore] loadConversations error:', e);
    } finally {
      set({ conversationsLoading: false });
    }
  },

  // ─── Active conversation ──────────────────────────────────

  setActiveConversation: (id) => {
    set({ activeConversationId: id, replyToMessage: null, editingMessage: null });
    if (id && !get().messagesByConv[id]) {
      void get().loadMessages(id);
    }
  },

  // ─── Load messages ────────────────────────────────────────

  loadMessages: async (conversationId, older = false) => {
    const state = get();
    if (state.messagesLoading[conversationId]) return;

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
        // Deduplicate by id
        const seen = new Set<string>();
        const deduped = merged.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });

        return {
          messagesByConv: { ...s.messagesByConv, [conversationId]: deduped },
          hasMore: { ...s.hasMore, [conversationId]: messages.length >= limit },
        };
      });
    } catch (e) {
      console.error('[chatStore] loadMessages error:', e);
    } finally {
      set((s) => ({
        messagesLoading: { ...s.messagesLoading, [conversationId]: false },
      }));
    }
  },

  // ─── Send message (optimistic) ────────────────────────────

  sendMessage: async (conversationId, content, replyToId, payloadType = 'text', payload = {}) => {
    playAudio('send');
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const serverReplyId =
      replyToId != null && /^\d+$/.test(String(replyToId)) ? replyToId : null;

    const pt: api.MessagePayloadType =
      payloadType === 'image' || payloadType === 'file' || payloadType === 'audio' || payloadType === 'prayer_request'
        ? payloadType
        : 'text';

    // Optimistic: add temp message immediately
    const optimistic: MessageWithSender = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: get().currentMemberId ?? null,
      client_msg_id: clientMsgId,
      content,
      payload_type: pt,
      payload: pt === 'text' ? { text: content } : payload,
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
        [conversationId]: [...(s.messagesByConv[conversationId] || []), optimistic],
      },
      replyToMessage: null,
    }));

    try {
      const real = await api.sendMessage(conversationId, content, serverReplyId, clientMsgId, pt, payload);
      // Replace temp with real and dedupe against WS echo by id/client_msg_id.
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [conversationId]: dedupeMessages(
            (s.messagesByConv[conversationId] || []).map((m) => (m.id === tempId ? { ...real, status: 'sent' } : m)),
          ),
        },
      }));
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
          [conversationId]: (s.messagesByConv[conversationId] || []).map((m) =>
            m.id === tempId ? { ...m, status: 'error' } : m,
          ),
        },
      }));
      emitAppToast('Не удалось отправить сообщение', 'error');
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

  retryAllFailed: async () => {
    await runRetryAllFailed(get);
  },

  // ─── Edit message ─────────────────────────────────────────

  editMessage: async (messageId, content) => {
    const convId = get().activeConversationId;
    if (!convId) return;

    // Optimistic edit
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] || []).map((m) =>
          m.id === messageId ? { ...m, content, is_edited: true } : m,
        ),
      },
      editingMessage: null,
    }));

    try {
      await api.editMessage(messageId, content);
    } catch (e) {
      console.error('[chatStore] editMessage error:', e);
      // Rollback by reloading
      void get().loadMessages(convId);
    }
  },

  // ─── Delete message ───────────────────────────────────────

  deleteMessage: async (messageId) => {
    const convId = get().activeConversationId;
    if (!convId) return;

    // Optimistic delete
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] || []).map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, content: '' } : m,
        ),
      },
    }));

    try {
      await api.deleteMessage(messageId);
    } catch (e) {
      console.error('[chatStore] deleteMessage error:', e);
      void get().loadMessages(convId);
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
    try {
      await api.addReaction(messageId, emoji);
    } catch (e) {
      console.error('[chatStore] addReaction error:', e);
    }
  },

  removeReaction: async (messageId, emoji) => {
    try {
      await api.removeReaction(messageId, emoji);
    } catch (e) {
      console.error('[chatStore] removeReaction error:', e);
    }
  },

  // ─── Reply / Edit state ───────────────────────────────────

  setReplyTo: (msg) => set({ replyToMessage: msg, editingMessage: null }),
  setReplyingTo: (msg) => set({ replyingTo: msg, editingMessage: null }),
  setEditing: (msg) => set({ editingMessage: msg, replyToMessage: null }),

  // ─── WS event handlers ───────────────────────────────────

  handleNewMessage: (convId, msg) => {
    const idKey = String(convId);
    const state = get();
    const existingNow = state.messagesByConv[idKey] || [];
    const msgClientId = msg.client_msg_id ? String(msg.client_msg_id) : null;
    const isOwnNow =
      state.currentMemberId != null &&
      msg.sender_id != null &&
      Number(msg.sender_id) === Number(state.currentMemberId);
    const alreadyPresent =
      existingNow.some((m) => m.id === msg.id) ||
      (msgClientId != null &&
        existingNow.some((m) => m.id.startsWith('temp-') && m.client_msg_id === msgClientId));
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
      // WS payload often omits `is_read`; treat omitted as unread.
      // Count only incoming messages and only when chat is not active.
      const shouldCountUnread = msg.is_read !== true && !isOwnMessage && !isActiveConversation;
      const targetConversation = s.conversations.find((c) => c.id === idKey) || null;

      // Already present by definitive server id.
      if (existing.some((m) => m.id === msg.id)) return s;

      // If optimistic temp exists with same client_msg_id, replace it (no append).
      const hasOptimisticTwin =
        msgClientId != null &&
        existing.some((m) => m.id.startsWith('temp-') && m.client_msg_id === msgClientId);
      const merged = hasOptimisticTwin
        ? existing.map((m) =>
            m.id.startsWith('temp-') && m.client_msg_id === msgClientId ? msg : m,
          )
        : [...existing, msg];
      const newMsgs = dedupeMessages(merged);

      // Update conversation list
      const updatedConvs = s.conversations.map((c) => {
        if (c.id !== idKey) return c;
        return {
          ...c,
          last_message: {
            id: msg.id,
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
  },

  handleMessageEdited: (convId, msgId, content, updatedAt) => {
    const idKey = String(convId);
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [idKey]: (s.messagesByConv[idKey] || []).map((m) =>
          m.id === msgId ? { ...m, content, is_edited: true, updated_at: updatedAt } : m,
        ),
      },
    }));
  },

  handleMessageDeleted: (convId, msgId) => {
    const idKey = String(convId);
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [idKey]: (s.messagesByConv[idKey] || []).map((m) =>
          m.id === msgId ? { ...m, is_deleted: true, content: '' } : m,
        ),
      },
    }));
  },

  handleReaction: (convId, msgId, emoji, memberId, action) => {
    const idKey = String(convId);
    set((s) => {
      const me = s.currentMemberId;
      return {
        messagesByConv: {
          ...s.messagesByConv,
          [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
            if (m.id !== msgId) return m;
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
      if (s.conversations.some((c) => c.id === normalized.id)) return s;
      const updated = [normalized, ...s.conversations];
      return { conversations: updated };
    });
  },

  handleReadUpdated: (convId, memberId, lastReadMsgId) => {
    const convKey = String(convId);
    const mid = Number(memberId);
    const msgId = String(lastReadMsgId ?? '').trim();
    if (!convKey || !Number.isFinite(mid) || mid <= 0 || !/^\d+$/.test(msgId)) {
      return;
    }
    // Ignore my own cursor in receipts UI.
    const me = get().currentMemberId;
    if (me != null && Number(me) === mid) return;

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

  handlePresenceOffline: (memberId) => {
    set((s) => {
      const next = new Set(s.onlineMembers);
      next.delete(memberId);
      return { onlineMembers: next };
    });
  },

  setOnlineMembers: (ids) => {
    set({ onlineMembers: new Set(ids) });
  },

  setCurrentMemberId: (id) => {
    set({ currentMemberId: id });
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
      if (userId) {
        const stored = localStorage.getItem(`messenger_drafts_${userId}`);
        if (stored) {
          const drafts = JSON.parse(stored);
          set({ drafts });
        }
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
    void runRetryAllFailed(useChatStore.getState);
  });
}

function classifyConversation(conv: ConversationListItem): Exclude<ChatTab, 'all'> {
  // Heuristic v1:
  // - private → personal
  // - group → services
  // - channel → notifications
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
