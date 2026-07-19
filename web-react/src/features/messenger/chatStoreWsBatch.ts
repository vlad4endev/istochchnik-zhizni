/**
 * Чистые apply-* для WS: один set() в handleWsMessageBatch вместо N коммитов React.
 */
import {
  normalizeConversationListItem,
  type ConversationListItem,
  type ConversationListRow,
  type MessageWithSender,
} from './api/messengerApi';
import { canAccessMessengerAssistantSession } from '../auth/authStore';
import { emitAppToast } from '../../lib/uiFeedback';
import { playAudio } from '../../utils/audio';
import { sendRealtimeJson } from '../../lib/realtimeWsClient';
import { isMessengerChatReadSurfaceOpen } from './messengerReadSurface';
import { getAvatarInitial } from './avatarUtils';
import { inferMessengerPayloadType } from './payloadMedia';
import { isAssistantMessengerChannel } from './messengerChannelKinds';
import type { ChatState } from './chatStore';

export type WsInboundMessage = Record<string, unknown> & { type?: string };

export type WsBatchEffect =
  | { type: 'play_receive' }
  | {
      type: 'toast_new_message';
      convId: string;
      msg: MessageWithSender;
      conversation: ConversationListItem | null;
    }
  | { type: 'mark_read_up_to'; convId: string; msgId: string }
  | {
      type: 'delivered_signal';
      convId: string;
      messageId: string;
      clientMsgId: string;
      senderId: number;
    }
  | { type: 'load_conversations'; force: boolean; ready?: boolean }
  | { type: 'load_messages'; convId: string; force: boolean }
  | { type: 'refresh_unread' }
  | { type: 'schedule_conv_fallback' }
  | { type: 'clear_server_ack'; convId: string; clientMsgId: string }
  | { type: 'arm_typing_timer'; convId: string; memberId: number }
  | { type: 'clear_typing_timer'; convId: string; memberId: number }
  | { type: 'save_snapshot' }
  | { type: 'hydrate_cache_if_new_member'; memberId: number; prevMemberId: number | null };

function normalizeIncomingMessengerMessage(msg: MessageWithSender): MessageWithSender {
  if (msg.payload_type) return msg;
  return { ...msg, payload_type: inferMessengerPayloadType(msg) };
}

function isProvisionalMessageId(mid: string): boolean {
  return mid.startsWith('temp-') || mid.startsWith('pending-');
}

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
  return [updated, ...conversations.slice(0, idx), ...conversations.slice(idx + 1)];
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
  s: ChatState,
  convId: string,
  tail: MessageWithSender,
  conversationsForPrev?: ConversationListItem[],
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
  const convList = conversationsForPrev ?? s.conversations;
  const me = s.currentMemberId;
  const isMine = me != null && tail.sender_id != null && Number(tail.sender_id) === Number(me);
  let read_by_others: boolean | undefined;
  if (isMine) {
    if (!/^\d+$/.test(String(tail.id))) {
      read_by_others = false;
    } else {
      const maxR = maxOtherReadCursor(s.readCursorsByConv[String(convId)]);
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

function messageCountsAsUnreadForCurrentUser(
  msg: Pick<MessageWithSender, 'is_read' | 'sender_id' | 'payload_type'>,
  currentMemberId: number | null,
): boolean {
  if (currentMemberId == null) return false;
  if (msg.sender_id != null && Number(msg.sender_id) === Number(currentMemberId)) return false;
  if (msg.payload_type === 'access_request') return false;
  return msg.is_read === false;
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

function syncConversationLastMessageAfterMutation(
  s: ChatState,
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
      ? { ...c, last_message: listPreviewFromMessage(s, convId, tail, conversations) }
      : c,
  );
}

function truncateMessageForToast(content: string): string {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Новое сообщение';
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
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
      avatarText: getAvatarInitial(title),
    };
  }
  const sender = msg.sender_name || msg.sender_first_name || 'Новое сообщение';
  return {
    title: sender,
    avatarUrl: null,
    avatarText: getAvatarInitial(sender),
  };
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Логика handleNewMessage без set() — для батча и одиночных вызовов. */
export function applyNewMessage(
  s: ChatState,
  convId: string,
  incoming: MessageWithSender,
  effects: WsBatchEffect[],
): ChatState {
  const msg = normalizeIncomingMessengerMessage(incoming);
  const idKey = String(convId);
  const serverMsgId = String(msg.id);
  const existing = s.messagesByConv[idKey] || [];
  const msgClientId = msg.client_msg_id ? String(msg.client_msg_id) : null;
  const isOwn =
    s.currentMemberId != null &&
    msg.sender_id != null &&
    Number(msg.sender_id) === Number(s.currentMemberId);
  const isProvisionalLocalId = (mid: string) => mid.startsWith('temp-') || mid.startsWith('pending-');
  const alreadyPresent =
    existing.some((m) => String(m.id) === serverMsgId) ||
    (msgClientId != null &&
      existing.some((m) => isProvisionalLocalId(String(m.id)) && m.client_msg_id === msgClientId));

  if (!isOwn && !alreadyPresent) {
    effects.push({ type: 'play_receive' });
  }

  if (
    isMessengerChatReadSurfaceOpen() &&
    s.activeConversationId === idKey &&
    !isOwn &&
    /^\d+$/.test(serverMsgId) &&
    !alreadyPresent
  ) {
    effects.push({ type: 'mark_read_up_to', convId: idKey, msgId: serverMsgId });
  }

  if (existing.some((m) => String(m.id) === serverMsgId)) return s;

  const hasProvisionalTwin =
    msgClientId != null &&
    existing.some((m) => isProvisionalLocalId(String(m.id)) && m.client_msg_id === msgClientId);
  const alreadyPresentByClientId =
    msgClientId != null && existing.some((m) => m.client_msg_id === msgClientId);
  const isActiveConversation = s.activeConversationId === idKey;
  const isPageVisible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
  const shouldCountUnread =
    !hasProvisionalTwin &&
    !alreadyPresentByClientId &&
    messageCountsAsUnreadForCurrentUser(msg, s.currentMemberId) &&
    (!isActiveConversation || !isPageVisible);

  const merged = hasProvisionalTwin
    ? existing.map((m) => {
        if (!isProvisionalLocalId(String(m.id)) || m.client_msg_id !== msgClientId) return m;
        const prevSt = m.status;
        const nextStatus = prevSt === 'delivered' ? ('delivered' as const) : ('sent' as const);
        return { ...msg, status: nextStatus };
      })
    : [...existing, msg];
  const newMsgs = dedupeMessages(merged);

  const prevUnreadForConv = s.conversations.find((c) => c.id === idKey)?.unread_count ?? 0;
  const nextUnreadForConv = shouldCountUnread ? prevUnreadForConv + 1 : prevUnreadForConv;
  const targetConversation = s.conversations.find((c) => c.id === idKey) || null;
  const updatedConvs = moveConversationToTop(s.conversations, idKey, (c) => ({
    ...c,
    last_message: listPreviewFromMessage(s, idKey, msg, s.conversations),
    updated_at: msg.created_at,
    unread_count: nextUnreadForConv,
  }));
  const totalUnread = s.totalUnread + (nextUnreadForConv - prevUnreadForConv);

  if (
    !isActiveConversation &&
    !isOwn &&
    !hasProvisionalTwin &&
    !alreadyPresentByClientId
  ) {
    effects.push({
      type: 'toast_new_message',
      convId: idKey,
      msg,
      conversation: targetConversation,
    });
  }

  const next: ChatState = {
    ...s,
    messagesByConv: { ...s.messagesByConv, [idKey]: newMsgs },
    conversations: updatedConvs,
    totalUnread,
  };

  if (!next.conversations.some((c) => c.id === idKey)) {
    effects.push({ type: 'load_conversations', force: true });
  }

  if (
    !alreadyPresent &&
    !isOwn &&
    msgClientId &&
    msg.sender_id != null &&
    (serverMsgId.startsWith('pending-') || /^\d+$/.test(serverMsgId))
  ) {
    effects.push({
      type: 'delivered_signal',
      convId: idKey,
      messageId: serverMsgId,
      clientMsgId: msgClientId,
      senderId: Number(msg.sender_id),
    });
  }

  return next;
}

function applyTypingStart(s: ChatState, convId: string, memberId: number, memberName: string, effects: WsBatchEffect[]): ChatState {
  const idKey = String(convId);
  const existing = s.typingByConv[idKey] || [];
  effects.push({ type: 'clear_typing_timer', convId: idKey, memberId });
  const filtered = existing.filter((u) => u.memberId !== memberId);
  const placeholderTimer = 0 as unknown as ReturnType<typeof setTimeout>;
  effects.push({ type: 'arm_typing_timer', convId: idKey, memberId });
  return {
    ...s,
    typingByConv: {
      ...s.typingByConv,
      [idKey]: [...filtered, { memberId, memberName, timer: placeholderTimer }],
    },
  };
}

function applyTypingStop(s: ChatState, convId: string, memberId: number, effects: WsBatchEffect[]): ChatState {
  const idKey = String(convId);
  effects.push({ type: 'clear_typing_timer', convId: idKey, memberId });
  const existing = s.typingByConv[idKey] || [];
  return {
    ...s,
    typingByConv: {
      ...s.typingByConv,
      [idKey]: existing.filter((u) => u.memberId !== memberId),
    },
  };
}

export function applyWsEvent(s: ChatState, msg: WsInboundMessage, effects: WsBatchEffect[]): ChatState {
  switch (msg.type) {
    case 'ready': {
      let next = s;
      if (typeof msg.memberId === 'number') {
        const prev = s.currentMemberId;
        next = { ...next, currentMemberId: msg.memberId };
        effects.push({ type: 'hydrate_cache_if_new_member', memberId: msg.memberId, prevMemberId: prev });
      }
      if (Array.isArray(msg.onlineMembers)) {
        next = { ...next, onlineMembers: new Set(msg.onlineMembers as number[]) };
      }
      effects.push({ type: 'load_conversations', force: true, ready: true });
      effects.push({ type: 'refresh_unread' });
      return next;
    }

    case 'msg:new': {
      const convId =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const payload = msg.message;
      if (convId && payload && typeof payload === 'object' && (payload as MessageWithSender).id != null) {
        return applyNewMessage(s, convId, payload as MessageWithSender, effects);
      }
      if (convId) {
        effects.push({ type: 'load_messages', convId, force: true });
        effects.push({ type: 'load_conversations', force: true });
      }
      return s;
    }

    case 'msg:send_failed': {
      const convId =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const clientMsgId =
        msg.clientMsgId != null && String(msg.clientMsgId).trim() !== ''
          ? String(msg.clientMsgId).trim()
          : '';
      if (!convId || !clientMsgId) return s;
      effects.push({ type: 'clear_server_ack', convId, clientMsgId });
      const idKey = String(convId);
      const cid = clientMsgId;
      const list = s.messagesByConv[idKey] || [];
      const next = list.map((m) =>
        m.client_msg_id === cid &&
        (String(m.id).startsWith('temp-') || String(m.id).startsWith('pending-'))
          ? { ...m, status: 'error' as const }
          : m,
      );
      return { ...s, messagesByConv: { ...s.messagesByConv, [idKey]: next } };
    }

    case 'msg:server_ack': {
      const convId =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const clientMsgId =
        msg.clientMsgId != null && String(msg.clientMsgId).trim() !== ''
          ? String(msg.clientMsgId).trim()
          : '';
      if (!convId || !clientMsgId) return s;
      effects.push({ type: 'clear_server_ack', convId, clientMsgId });
      const idKey = String(convId);
      const c = clientMsgId;
      return {
        ...s,
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
      };
    }

    case 'msg:delivered': {
      const convId = pickString(msg.conversationId, msg.conversation_id, msg.chatId, msg.chat_id) || null;
      const clientMsgId = pickString(msg.clientMsgId, msg.client_msg_id);
      const messageId = pickString(msg.messageId, msg.message_id);
      if (!convId || (!clientMsgId && !messageId)) return s;
      const idKey = String(convId);
      const c = clientMsgId;
      const mid = messageId;
      const me = s.currentMemberId;
      return {
        ...s,
        messagesByConv: {
          ...s.messagesByConv,
          [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
            if (me == null || m.sender_id == null || Number(m.sender_id) !== Number(me)) return m;
            const match = (c && String(m.client_msg_id || '') === c) || (mid && String(m.id) === mid);
            if (!match) return m;
            if (m.status === 'error' || m.status === 'sending') return m;
            return { ...m, status: 'delivered' as const };
          }),
        },
      };
    }

    case 'msg:edited': {
      const cid =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const mid =
        msg.messageId != null && String(msg.messageId).trim() !== '' ? String(msg.messageId) : null;
      if (!cid || !mid || typeof msg.content !== 'string' || typeof msg.updatedAt !== 'string') return s;
      const idKey = String(cid);
      const messageId = String(mid);
      const nextMsgs = (s.messagesByConv[idKey] || []).map((m) =>
        String(m.id) === messageId ? { ...m, content: msg.content as string, is_edited: true, updated_at: msg.updatedAt as string } : m,
      );
      return {
        ...s,
        messagesByConv: { ...s.messagesByConv, [idKey]: nextMsgs },
        conversations: syncConversationLastMessageOnEdit(s.conversations, idKey, messageId, msg.content as string),
      };
    }

    case 'msg:payload_updated': {
      const cid =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const mid =
        msg.messageId != null && String(msg.messageId).trim() !== '' ? String(msg.messageId) : null;
      const pl = msg.payload;
      if (!cid || !mid || !pl || typeof pl !== 'object' || Array.isArray(pl) || typeof msg.updatedAt !== 'string') {
        return s;
      }
      const idKey = String(cid);
      const messageId = String(mid);
      const nextMsgs = (s.messagesByConv[idKey] || []).map((m) =>
        String(m.id) === messageId
          ? { ...m, payload: pl as Record<string, unknown>, updated_at: msg.updatedAt as string }
          : m,
      );
      return { ...s, messagesByConv: { ...s.messagesByConv, [idKey]: nextMsgs } };
    }

    case 'msg:deleted': {
      const cid =
        msg.conversationId != null && String(msg.conversationId).trim() !== ''
          ? String(msg.conversationId)
          : null;
      const mid =
        msg.messageId != null && String(msg.messageId).trim() !== '' ? String(msg.messageId) : null;
      if (!cid || !mid) return s;
      const idKey = String(cid);
      const messageId = String(mid);
      const nextMsgs = (s.messagesByConv[idKey] || []).map((m) =>
        String(m.id) === messageId ? { ...m, is_deleted: true, content: '' } : m,
      );
      return {
        ...s,
        messagesByConv: { ...s.messagesByConv, [idKey]: nextMsgs },
        conversations: syncConversationLastMessageAfterMutation(
          s,
          s.conversations,
          idKey,
          nextMsgs,
          messageId,
        ),
      };
    }

    case 'msg:reaction': {
      const convId = String(msg.conversationId ?? '');
      const messageId = String(msg.messageId ?? '');
      const emoji = String(msg.emoji ?? '');
      const memberId = Number(msg.memberId);
      const action = msg.action === 'remove' ? 'remove' : 'add';
      if (!convId || !messageId || !emoji) return s;
      const idKey = convId;
      const me = s.currentMemberId;
      return {
        ...s,
        messagesByConv: {
          ...s.messagesByConv,
          [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
            if (String(m.id) !== messageId) return m;
            let reactions = [...(m.reactions || [])];
            const existingIdx = reactions.findIndex((r) => r.emoji === emoji);
            if (action === 'add') {
              if (existingIdx >= 0) {
                const prev = reactions[existingIdx];
                if (memberId === me && prev.reacted_by_me) return m;
                reactions[existingIdx] = {
                  ...prev,
                  count: prev.count + 1,
                  reacted_by_me: prev.reacted_by_me || memberId === me,
                };
              } else {
                reactions.push({ emoji, count: 1, reacted_by_me: memberId === me });
              }
            } else if (existingIdx >= 0) {
              const prev = reactions[existingIdx];
              if (memberId === me && !prev.reacted_by_me) return m;
              const newCount = prev.count - 1;
              const reactedByMe = memberId === me ? false : prev.reacted_by_me;
              if (newCount <= 0) {
                reactions = reactions.filter((_, i) => i !== existingIdx);
              } else {
                reactions[existingIdx] = { ...prev, count: newCount, reacted_by_me: reactedByMe };
              }
            }
            return { ...m, reactions };
          }),
        },
      };
    }

    case 'msg:poll': {
      if (!Array.isArray(msg.tallies)) return s;
      const convId = String(msg.conversationId ?? '');
      const mid = String(msg.messageId ?? '');
      const tallies = msg.tallies as number[];
      if (!convId || !mid) return s;
      const idKey = convId;
      return {
        ...s,
        messagesByConv: {
          ...s.messagesByConv,
          [idKey]: (s.messagesByConv[idKey] || []).map((m) => {
            if (String(m.id) !== mid) return m;
            const next: MessageWithSender = { ...m, poll_tallies: [...tallies] };
            return next;
          }),
        },
      };
    }

    case 'typing:start':
      return applyTypingStart(s, String(msg.conversationId), Number(msg.memberId), String(msg.memberName ?? ''), effects);

    case 'typing:stop':
      return applyTypingStop(s, String(msg.conversationId), Number(msg.memberId), effects);

    case 'conv:created': {
      const conv = msg.conversation;
      if (!conv || typeof conv !== 'object') return s;
      const normalized = normalizeConversationListItem({
        ...(conv as ConversationListRow),
        id: String((conv as ConversationListRow).id),
      });
      if (
        isAssistantMessengerChannel(normalized.metadata) &&
        !canAccessMessengerAssistantSession()
      ) {
        return s;
      }
      const exists = s.conversations.some((c) => String(c.id) === normalized.id);
      const conversations = exists
        ? s.conversations.map((c) => (String(c.id) === normalized.id ? { ...c, ...normalized } : c))
        : [normalized, ...s.conversations];
      const om = normalized.other_member;
      const ls = om?.last_seen_at;
      const memberLastSeenAt =
        om && ls ? { ...s.memberLastSeenAt, [om.id]: ls } : s.memberLastSeenAt;
      return { ...s, conversations, memberLastSeenAt };
    }

    case 'conv:updated': {
      const cid =
        typeof msg.conversationId === 'string' && msg.conversationId ? String(msg.conversationId) : null;
      if (!cid) {
        effects.push({ type: 'schedule_conv_fallback' });
        return s;
      }
      const idKey = cid;
      let next = {
        ...s,
        pinnedBumpByConv: { ...s.pinnedBumpByConv, [idKey]: (s.pinnedBumpByConv[idKey] || 0) + 1 },
      };
      if (msg.conversation && typeof msg.conversation === 'object') {
        const exists = next.conversations.some((c) => String(c.id) === idKey);
        if (!exists) {
          effects.push({ type: 'schedule_conv_fallback' });
          return next;
        }
        const normalizedPatch: Partial<ConversationListItem> & { avatarUrl?: string | null } = {
          ...(msg.conversation as Partial<ConversationListItem>),
        };
        if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'avatarUrl')) {
          normalizedPatch.avatar_url = normalizedPatch.avatarUrl ?? null;
          delete normalizedPatch.avatarUrl;
        }
        const conversations = next.conversations.map((c) => {
          if (String(c.id) !== idKey) return c;
          const merged = { ...c, ...normalizedPatch } as ConversationListRow;
          return normalizeConversationListItem(merged);
        });
        return { ...next, conversations };
      }
      if (
        typeof (msg as { title?: unknown }).title !== 'undefined' ||
        typeof (msg as { avatarUrl?: unknown }).avatarUrl !== 'undefined' ||
        typeof (msg as { avatar_url?: unknown }).avatar_url !== 'undefined'
      ) {
        const m = msg as {
          title?: string | null;
          avatarUrl?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        const patch: Record<string, unknown> = {};
        if (typeof m.title !== 'undefined') patch.title = m.title;
        if (typeof m.avatarUrl !== 'undefined' || typeof m.avatar_url !== 'undefined') {
          patch.avatar_url = m.avatar_url !== undefined ? m.avatar_url : m.avatarUrl;
        }
        if (typeof m.updated_at === 'string') patch.updated_at = m.updated_at;
        const exists = next.conversations.some((c) => String(c.id) === idKey);
        if (!exists) {
          effects.push({ type: 'schedule_conv_fallback' });
          return next;
        }
        const conversations = next.conversations.map((c) => {
          if (String(c.id) !== idKey) return c;
          const merged = { ...c, ...patch } as ConversationListRow;
          return normalizeConversationListItem(merged);
        });
        return { ...next, conversations };
      }
      effects.push({ type: 'schedule_conv_fallback' });
      return next;
    }

    case 'conv:history_cleared': {
      if (typeof msg.conversationId !== 'string' || !msg.conversationId) return s;
      const conversationId = msg.conversationId;
      const conversations = s.conversations.map((c) =>
        c.id === conversationId ? { ...c, last_message: null, unread_count: 0 } : c,
      );
      const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      effects.push({ type: 'schedule_conv_fallback' });
      effects.push({ type: 'save_snapshot' });
      return {
        ...s,
        messagesByConv: { ...s.messagesByConv, [conversationId]: [] },
        conversations,
        totalUnread,
      };
    }

    case 'read:updated':
    case 'messages_read': {
      const conversationId = pickString(
        msg.conversationId,
        msg.conversation_id,
        msg.chatId,
        msg.chat_id,
      );
      const memberId = pickNumber(msg.memberId, msg.member_id, msg.userId, msg.user_id);
      const lastReadMessageId = pickString(
        msg.lastReadMessageId,
        msg.last_read_message_id,
        msg.messageId,
        msg.message_id,
      );
      if (!conversationId || memberId == null || !lastReadMessageId) return s;
      const convKey = String(conversationId);
      const mid = memberId;
      const msgId = lastReadMessageId;
      const me = s.currentMemberId;
      if (me != null && Number(me) === mid) {
        const prev = s.myReadCursorByConv[convKey];
        if (prev && /^\d+$/.test(prev) && BigInt(prev) >= BigInt(msgId)) return s;
        return {
          ...s,
          myReadCursorByConv: { ...s.myReadCursorByConv, [convKey]: msgId },
        };
      }
      const existing = s.readCursorsByConv[convKey] || {};
      const prev = existing[mid];
      if (prev && /^\d+$/.test(prev) && BigInt(prev) >= BigInt(msgId)) return s;
      return {
        ...s,
        readCursorsByConv: {
          ...s.readCursorsByConv,
          [convKey]: { ...existing, [mid]: msgId },
        },
      };
    }

    case 'presence:online': {
      const memberId = Number(msg.memberId);
      if (!Number.isFinite(memberId)) return s;
      const next = new Set(s.onlineMembers);
      next.add(memberId);
      return { ...s, onlineMembers: next };
    }

    case 'presence:offline': {
      const memberId = Number(msg.memberId);
      if (!Number.isFinite(memberId)) return s;
      const next = new Set(s.onlineMembers);
      next.delete(memberId);
      const lastSeenAt = typeof msg.lastSeenAt === 'string' ? msg.lastSeenAt : undefined;
      const memberLastSeenAt =
        lastSeenAt != null && String(lastSeenAt).trim() !== ''
          ? { ...s.memberLastSeenAt, [memberId]: String(lastSeenAt) }
          : s.memberLastSeenAt;
      return { ...s, onlineMembers: next, memberLastSeenAt };
    }

    case 'invalidate':
    case 'pong':
    default:
      return s;
  }
}

export type WsBatchStoreGet = () => ChatState & {
  markReadUpTo: (convId: string, messageId: string) => Promise<void>;
  loadConversations: (opts?: { force?: boolean }) => Promise<void>;
  loadMessages: (conversationId: string, older?: boolean, opts?: { force?: boolean }) => Promise<void>;
  refreshUnread: () => Promise<void>;
  handleTypingStop: (convId: string, memberId: number) => void;
};

export type WsBatchRuntime = {
  get: WsBatchStoreGet;
  debouncedMarkReadUpTo: (convId: string, msgId: string, fn: (c: string, m: string) => void) => void;
  clearServerAckTimer: (convId: string, clientMsgId: string) => void;
  scheduleConversationsFallbackRefresh: (force?: boolean) => void;
  shouldSyncConversationsOnReady: () => boolean;
  markReadySyncDone: () => void;
  armTypingAutoStop: (convId: string, memberId: number, onStop: () => void) => void;
  clearTypingTimer: (convId: string, memberId: number) => void;
  hydrateCacheIfNewMember: (memberId: number, prevMemberId: number | null) => void;
  saveSnapshot: () => void;
};

export function runWsBatchEffects(effects: WsBatchEffect[], rt: WsBatchRuntime): void {
  if (effects.some((e) => e.type === 'play_receive')) {
    playAudio('receive');
  }

  for (const effect of effects) {
    switch (effect.type) {
      case 'play_receive':
        break;
      case 'toast_new_message': {
        const toastMeta = getConversationToastMeta(effect.conversation, effect.msg);
        emitAppToast({
          kind: 'info',
          title: toastMeta.title,
          avatarUrl: toastMeta.avatarUrl,
          avatarText: toastMeta.avatarText,
          message: truncateMessageForToast(effect.msg.is_deleted ? 'Сообщение удалено' : effect.msg.content),
          action: {
            event: 'app:open-conversation',
            detail: { conversationId: effect.convId },
          },
        });
        break;
      }
      case 'mark_read_up_to':
        rt.debouncedMarkReadUpTo(effect.convId, effect.msgId, (c, m) => {
          void rt.get().markReadUpTo(c, m);
        });
        break;
      case 'delivered_signal':
        queueMicrotask(() => {
          sendRealtimeJson({
            type: 'msg:delivered_signal',
            conversationId: effect.convId,
            messageId: effect.messageId,
            clientMsgId: effect.clientMsgId,
            senderId: effect.senderId,
          });
        });
        break;
      case 'load_conversations': {
        if (effect.ready && !rt.shouldSyncConversationsOnReady()) break;
        void rt.get().loadConversations({ force: effect.force });
        if (effect.ready) rt.markReadySyncDone();
        break;
      }
      case 'load_messages':
        void rt.get().loadMessages(effect.convId, false, { force: effect.force });
        break;
      case 'refresh_unread':
        void rt.get().refreshUnread();
        break;
      case 'schedule_conv_fallback':
        rt.scheduleConversationsFallbackRefresh(false);
        break;
      case 'clear_server_ack':
        rt.clearServerAckTimer(effect.convId, effect.clientMsgId);
        break;
      case 'arm_typing_timer':
        rt.armTypingAutoStop(effect.convId, effect.memberId, () => {
          void rt.get().handleTypingStop(effect.convId, effect.memberId);
        });
        break;
      case 'clear_typing_timer':
        rt.clearTypingTimer(effect.convId, effect.memberId);
        break;
      case 'hydrate_cache_if_new_member':
        rt.hydrateCacheIfNewMember(effect.memberId, effect.prevMemberId);
        break;
      case 'save_snapshot':
        rt.saveSnapshot();
        break;
      default:
        break;
    }
  }
}

export function processMessengerWsBatch(
  events: WsInboundMessage[],
  set: (partial: ((s: ChatState) => ChatState) | Partial<ChatState>) => void,
  rt: WsBatchRuntime,
): void {
  if (!events.length) return;
  const effects: WsBatchEffect[] = [];
  set((s) => {
    let next = s;
    for (const event of events) {
      next = applyWsEvent(next, event, effects);
    }
    return next;
  });
  runWsBatchEffects(effects, rt);
}
