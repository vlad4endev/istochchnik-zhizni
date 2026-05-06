import { create } from 'zustand';

/**
 * @typedef {'text' | 'audio' | 'video' | 'image'} ChatMessageType
 */

/**
 * @typedef {'sending' | 'sent' | 'delivered' | 'read' | 'failed'} ChatMessageStatus
 */

/**
 * @typedef {Object} Chat
 * @property {string} id
 * @property {string} name
 * @property {string|null} [avatar]
 * @property {string} [lastMessage]
 * @property {number} lastTime
 * @property {boolean} [isOnline]
 * @property {number} unreadCount
 */

/**
 * @typedef {Object} ChatMessageReplyRef
 * @property {string} id
 * @property {string} [text]
 * @property {string|null} [senderName]
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {string} chatId
 * @property {string} text
 * @property {ChatMessageType} type
 * @property {ChatMessageStatus} status
 * @property {boolean} isSender
 * @property {number} timestamp
 * @property {string|null} [senderName]
 * @property {ChatMessageReplyRef} [replyTo]
 * @property {string|null} [mediaUrl]
 * @property {number|null} [durationSec]
 */

const initialState = {
  chats: [],
  /** @type {Chat | null} */
  activeChat: null,
  /** @type {Record<string, ChatMessage[]>} */
  messages: {},
  /** @type {Record<string, boolean>} */
  typingUsers: {},
  /** @type {ChatMessage | null} */
  replyTo: null,
};

export const useChatUiStore = create((set, get) => ({
  ...initialState,

  /**
   * @param {Chat[]} chats
   */
  setChats: (chats) => set({ chats: Array.isArray(chats) ? chats : [] }),

  /**
   * @param {Chat | null} chat
   */
  setActiveChat: (chat) => set({ activeChat: chat }),

  /**
   * @param {string} chatId
   * @param {ChatMessage} message
   */
  addMessage: (chatId, message) =>
    set((s) => {
      const prev = s.messages[chatId] ?? [];
      return {
        messages: {
          ...s.messages,
          [chatId]: [...prev, message],
        },
      };
    }),

  /**
   * @param {string} chatId
   * @param {ChatMessage[]} messages
   */
  setMessages: (chatId, messages) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: Array.isArray(messages) ? messages : [],
      },
    })),

  /**
   * @param {string} chatId
   * @param {string} messageId
   * @param {Partial<ChatMessage>} patch
   */
  patchMessage: (chatId, messageId, patch) =>
    set((s) => {
      const list = s.messages[chatId];
      if (!list) return s;
      return {
        messages: {
          ...s.messages,
          [chatId]: list.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
        },
      };
    }),

  /**
   * @param {string} chatId
   * @param {boolean} isTyping
   */
  setTyping: (chatId, isTyping) =>
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [chatId]: Boolean(isTyping),
      },
    })),

  /**
   * @param {ChatMessage | null} message
   */
  setReplyTo: (message) => set({ replyTo: message }),

  /**
   * @param {string} chatId
   */
  markRead: (chatId) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    })),
}));
