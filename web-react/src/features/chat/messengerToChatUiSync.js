import {
  useChatStore as useMessengerChatStore,
  isDraftPrivateConversationId,
} from '../messenger/chatStore';
import { useChatUiStore } from './store/chatStore';

/**
 * @param {import('../messenger/api/messengerApi').MessagePayload | undefined} payload
 * @returns {string | null}
 */
function pickMediaUrl(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {Record<string, unknown>} */ (payload);
  const url =
    (typeof p.url === 'string' && p.url) ||
    (typeof p.file_url === 'string' && p.file_url) ||
    (typeof p.preview_url === 'string' && p.preview_url) ||
    null;
  return url && url.trim() ? url.trim() : null;
}

/**
 * @param {import('../messenger/api/messengerApi').MessageWithSender} m
 * @param {string} convId
 * @param {number | null} currentMemberId
 */
export function mapMessengerMessageToUi(m, convId, currentMemberId) {
  const isSender = m.sender_id != null && m.sender_id === currentMemberId;

  /** @type {'sending' | 'sent' | 'delivered' | 'read' | 'failed'} */
  let status = 'sent';
  if (m.status === 'sending') status = 'sending';
  else if (m.status === 'error') status = 'failed';
  else if (m.status === 'delivered') status = 'delivered';
  else if (m.status === 'sent') status = 'sent';
  if (isSender && m.is_read) status = 'read';

  const pt = m.payload_type || m.type || 'text';
  /** @type {'text' | 'audio' | 'video' | 'image'} */
  let type = 'text';
  if (pt === 'audio') type = 'audio';
  else if (pt === 'video_note') type = 'video';
  else if (pt === 'image') type = 'image';
  else if (pt === 'file') type = 'image';

  const timestamp = Date.parse(m.created_at) || Date.now();
  const mediaUrl = pickMediaUrl(m.payload) || m.image_url || m.imageUrl || null;

  /** @type {import('./store/chatStore').ChatMessage} */
  const msg = {
    id: String(m.id),
    chatId: convId,
    text: m.content ?? '',
    type,
    status,
    isSender,
    timestamp,
    senderName: m.sender_name ?? null,
    mediaUrl,
    durationSec:
      m.payload && typeof m.payload === 'object' && typeof m.payload.duration === 'number'
        ? m.payload.duration
        : null,
    replyTo: m.reply_preview
      ? {
          id: m.reply_preview.id,
          text: m.reply_preview.content,
          senderName: m.reply_preview.sender_name,
        }
      : undefined,
  };
  return msg;
}

/**
 * @param {import('../messenger/api/messengerApi').ConversationListItem} c
 * @param {{ onlineMembers: Set<number> }} state
 */
export function mapConversationToUiChat(c, state) {
  const peer = c.other_member;
  const name =
    (c.title && String(c.title).trim()) ||
    (peer && peer.name && String(peer.name).trim()) ||
    'Чат';
  const last = c.last_message;
  const lastMessage =
    last && !last.is_deleted && typeof last.content === 'string' ? last.content : '';
  const lastTime = last ? Date.parse(last.created_at) || Date.now() : Date.parse(c.updated_at) || Date.now();
  const isOnline = peer != null && state.onlineMembers.has(peer.id);

  return {
    id: c.id,
    name,
    avatar: c.avatar_url,
    lastMessage,
    lastTime,
    isOnline,
    unreadCount: typeof c.unread_count === 'number' ? c.unread_count : 0,
  };
}

/**
 * Подписка на Zustand мессенджера → UI store чата (Flutter-экран).
 * @returns {() => void}
 */
export function startMessengerToChatUiSync() {
  const run = () => {
    const state = useMessengerChatStore.getState();
    const chats = state.conversations.map((c) => mapConversationToUiChat(c, state));
    useChatUiStore.getState().setChats(chats);

    const activeId = state.activeConversationId;
    if (activeId && !isDraftPrivateConversationId(activeId)) {
      const conv = state.conversations.find((x) => x.id === activeId);
      if (conv) {
        const peer = conv.other_member;
        const name =
          (conv.title && String(conv.title).trim()) ||
          (peer && peer.name && String(peer.name).trim()) ||
          'Чат';
        useChatUiStore.getState().setActiveChat({
          id: conv.id,
          name,
          avatar: conv.avatar_url,
          isOnline: peer != null && state.onlineMembers.has(peer.id),
        });
      }
    } else {
      useChatUiStore.getState().setActiveChat(null);
    }

    const mid = state.currentMemberId;
    for (const convId of Object.keys(state.messagesByConv)) {
      const list = state.messagesByConv[convId] || [];
      const uiMsgs = list.map((m) => mapMessengerMessageToUi(m, convId, mid));
      useChatUiStore.getState().setMessages(convId, uiMsgs);
    }

    const tid = state.activeConversationId;
    if (tid && !isDraftPrivateConversationId(tid)) {
      const typers = state.typingByConv[tid] || [];
      useChatUiStore.getState().setTyping(tid, typers.length > 0);
    }
  };

  run();
  return useMessengerChatStore.subscribe(run);
}
