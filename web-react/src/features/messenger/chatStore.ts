import { create } from 'zustand';
import type { ConversationListItem, MessageWithSender } from './api/messengerApi';
import * as api from './api/messengerApi';

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

  // --- Typing indicator: convId → memberId[] ---
  typingByConv: Record<string, TypingUser[]>;

  // --- Online presence ---
  onlineMembers: Set<number>;

  // --- Total unread ---
  totalUnread: number;

  // --- Reply state ---
  replyToMessage: MessageWithSender | null;

  // --- Edit state ---
  editingMessage: MessageWithSender | null;

  // --- Actions ---
  loadConversations: () => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  loadMessages: (conversationId: string, older?: boolean) => Promise<void>;

  /** Optimistic send: message appears instantly, then confirmed by server */
  sendMessage: (conversationId: string, content: string, replyToId?: string | null) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;

  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;

  setReplyTo: (msg: MessageWithSender | null) => void;
  setEditing: (msg: MessageWithSender | null) => void;

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
  typingByConv: {},
  onlineMembers: new Set(),
  totalUnread: 0,
  replyToMessage: null,
  editingMessage: null,

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

  sendMessage: async (conversationId, content, replyToId) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Optimistic: add temp message immediately
    const optimistic: MessageWithSender = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: null, // Will be set properly when confirmed
      content,
      reply_to_message_id: replyToId || null,
      is_edited: false,
      is_deleted: false,
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
      const real = await api.sendMessage(conversationId, content, replyToId);
      // Replace temp with real
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [conversationId]: (s.messagesByConv[conversationId] || []).map((m) =>
            m.id === tempId ? real : m,
          ),
        },
      }));
    } catch (e) {
      console.error('[chatStore] sendMessage error:', e);
      // Remove failed optimistic message
      set((s) => ({
        messagesByConv: {
          ...s.messagesByConv,
          [conversationId]: (s.messagesByConv[conversationId] || []).filter(
            (m) => m.id !== tempId,
          ),
        },
      }));
    }
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

    // Optimistic: set unread to 0
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
      totalUnread: Math.max(0, s.totalUnread - (s.conversations.find((c) => c.id === conversationId)?.unread_count ?? 0)),
    }));

    try {
      await api.markConversationRead(conversationId, lastMsg.id);
    } catch (e) {
      console.error('[chatStore] markRead error:', e);
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
  setEditing: (msg) => set({ editingMessage: msg, replyToMessage: null }),

  // ─── WS event handlers ───────────────────────────────────

  handleNewMessage: (convId, msg) => {
    set((s) => {
      // Don't add if already exists (sent by this client)
      const existing = s.messagesByConv[convId] || [];
      if (existing.some((m) => m.id === msg.id)) return s;

      const newMsgs = [...existing, msg];

      // Update conversation list
      const updatedConvs = s.conversations.map((c) => {
        if (c.id !== convId) return c;
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
          unread_count: s.activeConversationId === convId ? c.unread_count : c.unread_count + 1,
        };
      });

      // Sort by updated_at desc
      updatedConvs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const totalUnread = updatedConvs.reduce((sum, c) => sum + c.unread_count, 0);

      return {
        messagesByConv: { ...s.messagesByConv, [convId]: newMsgs },
        conversations: updatedConvs,
        totalUnread,
      };
    });
  },

  handleMessageEdited: (convId, msgId, content, updatedAt) => {
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] || []).map((m) =>
          m.id === msgId ? { ...m, content, is_edited: true, updated_at: updatedAt } : m,
        ),
      },
    }));
  },

  handleMessageDeleted: (convId, msgId) => {
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] || []).map((m) =>
          m.id === msgId ? { ...m, is_deleted: true, content: '' } : m,
        ),
      },
    }));
  },

  handleReaction: (convId, msgId, emoji, _memberId, action) => {
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: (s.messagesByConv[convId] || []).map((m) => {
          if (m.id !== msgId) return m;
          let reactions = [...m.reactions];
          const existingIdx = reactions.findIndex((r) => r.emoji === emoji);
          if (action === 'add') {
            if (existingIdx >= 0) {
              reactions[existingIdx] = {
                ...reactions[existingIdx],
                count: reactions[existingIdx].count + 1,
              };
            } else {
              reactions.push({ emoji, count: 1, reacted_by_me: false });
            }
          } else {
            if (existingIdx >= 0) {
              const newCount = reactions[existingIdx].count - 1;
              if (newCount <= 0) {
                reactions = reactions.filter((_, i) => i !== existingIdx);
              } else {
                reactions[existingIdx] = { ...reactions[existingIdx], count: newCount };
              }
            }
          }
          return { ...m, reactions };
        }),
      },
    }));
  },

  handleTypingStart: (convId, memberId, memberName) => {
    set((s) => {
      const existing = s.typingByConv[convId] || [];
      // Clear existing timer for this member
      const old = existing.find((u) => u.memberId === memberId);
      if (old) clearTimeout(old.timer);
      // Auto-clear after 4s
      const timer = setTimeout(() => {
        get().handleTypingStop(convId, memberId);
      }, 4000);
      const filtered = existing.filter((u) => u.memberId !== memberId);
      return {
        typingByConv: { ...s.typingByConv, [convId]: [...filtered, { memberId, memberName, timer }] },
      };
    });
  },

  handleTypingStop: (convId, memberId) => {
    set((s) => {
      const existing = s.typingByConv[convId] || [];
      const old = existing.find((u) => u.memberId === memberId);
      if (old) clearTimeout(old.timer);
      return {
        typingByConv: {
          ...s.typingByConv,
          [convId]: existing.filter((u) => u.memberId !== memberId),
        },
      };
    });
  },

  handleConvCreated: (conv) => {
    set((s) => {
      if (s.conversations.some((c) => c.id === conv.id)) return s;
      const updated = [conv, ...s.conversations];
      return { conversations: updated };
    });
  },

  handleReadUpdated: (_convId, _memberId, _lastReadMsgId) => {
    // Could update read receipts UI if we track per-member reads
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
}));
