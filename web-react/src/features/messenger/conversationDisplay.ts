import type { ConversationListItem } from './api/messengerApi';
import {
  isAccessRequestsMessengerChannel,
  isAssistantConversationRow,
} from './messengerChannelKinds';

export function conversationTitle(c: ConversationListItem): string {
  if (c.type === 'private' && c.other_member) {
    const om = c.other_member;
    const fl = `${om.first_name ?? ''} ${om.last_name ?? ''}`.trim();
    return fl || om.name || `Участник ${om.id}`;
  }
  return c.title?.trim() || (c.type === 'channel' ? 'Канал' : 'Группа');
}

export function conversationAvatar(c: ConversationListItem): string | null {
  if (c.type === 'private' && c.other_member?.avatar_url) return c.other_member.avatar_url;
  return c.avatar_url;
}

/**
 * Чат, в который текущий пользователь может отправить обычное сообщение
 * (зеркало серверных правил `chatPermission`: каналы — только owner/admin,
 * служебные каналы и личный ИИ-чат исключены).
 */
export function canSendTextToConversation(c: ConversationListItem): boolean {
  if (!/^\d+$/.test(String(c.id))) return false;
  if (isAccessRequestsMessengerChannel(c.metadata)) return false;
  if (isAssistantConversationRow({ metadata: c.metadata, title: c.title })) return false;
  if (c.type === 'channel' && c.my_role !== 'owner' && c.my_role !== 'admin') return false;
  const perms = c.default_permissions;
  if (c.type === 'group' && perms && perms.can_send_messages === false) {
    return c.my_role === 'owner' || c.my_role === 'admin';
  }
  return true;
}
