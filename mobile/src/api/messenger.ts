import { apiClient } from './client';

const BASE = '/api/messenger';

export type ConversationType = 'private' | 'group' | 'channel';

export type MessagePayloadType =
  | 'text'
  | 'prayer_request'
  | 'audio'
  | 'video_note'
  | 'image'
  | 'file'
  | 'poll'
  | 'access_request'
  | 'story_reply';

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  updated_at: string;
  last_message: {
    id: string;
    content: string;
    sender_id: number | null;
    sender_name: string | null;
    created_at: string;
    is_deleted: boolean;
    read_by_others?: boolean;
  } | null;
  unread_count: number;
  other_member: {
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
    last_seen_at?: string | null;
  } | null;
  my_muted?: boolean;
  my_ui_pinned?: boolean;
  my_ui_folder?: 'personal' | 'ministry' | null;
}

export interface MessageWithSender {
  id: string;
  conversation_id: string;
  sender_id: number | null;
  client_msg_id?: string | null;
  content: string;
  payload_type?: MessagePayloadType;
  payload?: Record<string, unknown>;
  reply_to_message_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  sender_name: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
  reply_preview: {
    id: string;
    content: string;
    sender_name: string | null;
    is_deleted: boolean;
  } | null;
  reactions: { emoji: string; count: number; reacted_by_me: boolean }[];
  poll_tallies?: number[];
  poll_my_options?: number[];
  status?: 'sending' | 'sent' | 'delivered' | 'error';
}

export interface SearchMember {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
  last_seen_at?: string | null;
  is_online?: boolean;
  registration_status?: 'active' | 'pending_review' | 'rejected';
}

function withAvatarCacheBust(url: string | null, versionIso: string | null | undefined): string | null {
  if (!url) return null;
  const t = versionIso ? Date.parse(String(versionIso)) : NaN;
  if (!Number.isFinite(t)) return url;
  if (/[?&]v=\d/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${t}`;
}

function normalizeConversation(c: ConversationListItem): ConversationListItem {
  const avatar_url = withAvatarCacheBust(c.avatar_url, c.updated_at);
  const om = c.other_member
    ? {
        ...c.other_member,
        avatar_url: withAvatarCacheBust(c.other_member.avatar_url ?? null, c.updated_at),
      }
    : null;
  return { ...c, id: String(c.id), avatar_url, other_member: om };
}

export async function fetchConversations(): Promise<ConversationListItem[]> {
  const { data } = await apiClient.get<ConversationListItem[]>(`${BASE}/conversations`);
  return (data ?? []).map(normalizeConversation);
}

export async function fetchMessages(
  conversationId: string,
  opts?: { beforeId?: string; afterId?: string; limit?: number },
): Promise<MessageWithSender[]> {
  const params: Record<string, string> = { limit: String(opts?.limit ?? 50) };
  if (opts?.beforeId) params.before = opts.beforeId;
  if (opts?.afterId) params.after = opts.afterId;
  const { data } = await apiClient.get<MessageWithSender[]>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { params },
  );
  return data ?? [];
}

export async function sendMessage(
  conversationId: string,
  content: string,
  clientMsgId?: string,
  replyToMessageId?: string | null,
): Promise<MessageWithSender> {
  const { data } = await apiClient.post<MessageWithSender>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { content, clientMsgId, replyToMessageId: replyToMessageId ?? null, payloadType: 'text' },
  );
  return data;
}

export async function markConversationRead(conversationId: string, messageId: string): Promise<void> {
  await apiClient.post(`${BASE}/conversations/${encodeURIComponent(conversationId)}/read`, {
    messageId,
  });
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>(`${BASE}/unread-count`);
  return data?.count ?? 0;
}

export async function createPersonalChat(otherMemberId: number): Promise<{
  conversationId: string;
  conversation: ConversationListItem | null;
}> {
  const { data } = await apiClient.post<{
    conversationId: string;
    conversation: ConversationListItem | null;
  }>(`${BASE}/conversations/personal`, { otherMemberId });
  return data;
}

export async function searchMembers(q: string): Promise<SearchMember[]> {
  const { data } = await apiClient.get<SearchMember[]>(`${BASE}/members/search`, { params: { q } });
  return data ?? [];
}

export function buildAttachmentFileUrl(
  messageId: string,
  opts?: { slot?: number; download?: boolean },
): string {
  const qs = new URLSearchParams();
  if (opts?.download) qs.set('download', '1');
  if (opts?.slot != null && Number.isFinite(opts.slot)) {
    qs.set('slot', String(Math.floor(opts.slot)));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return `${BASE}/messages/${encodeURIComponent(messageId)}/attachment-file${suffix}`;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await apiClient.delete(`${BASE}/messages/${messageId}`);
}

export async function addReaction(messageId: string, emoji: string): Promise<void> {
  await apiClient.post(`${BASE}/messages/${messageId}/reactions`, { emoji });
}

export async function removeReaction(messageId: string, emoji: string): Promise<void> {
  await apiClient.delete(
    `${BASE}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
  );
}
