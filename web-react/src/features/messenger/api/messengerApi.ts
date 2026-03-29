import { apiClient } from '../../../lib/apiClient';

const BASE = '/api/messenger';

// ─── Types (mirroring backend) ────────────────────────────────

export type ConversationType = 'personal' | 'group' | 'channel';
export type ParticipantRole = 'owner' | 'admin' | 'member';

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
  } | null;
  unread_count: number;
  other_member: {
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface MessageWithSender {
  id: string;
  conversation_id: string;
  sender_id: number | null;
  content: string;
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
}

export interface Participant {
  member_id: number;
  role: ParticipantRole;
  joined_at: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
}

export interface SearchMember {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
}

// ─── API calls ────────────────────────────────────────────────

export async function fetchConversations(): Promise<ConversationListItem[]> {
  const { data } = await apiClient.get<ConversationListItem[]>(`${BASE}/conversations`);
  return data;
}

export async function createPersonalChat(otherMemberId: number) {
  const { data } = await apiClient.post<{
    conversationId: string;
    conversation: ConversationListItem | null;
  }>(`${BASE}/conversations/personal`, { otherMemberId });
  return data;
}

export async function createGroupChat(title: string, type: ConversationType, memberIds: number[]) {
  const { data } = await apiClient.post<{
    conversationId: string;
    conversation: ConversationListItem | null;
  }>(`${BASE}/conversations/group`, { title, type, memberIds });
  return data;
}

export async function fetchMessages(conversationId: string, beforeId?: string, limit = 50): Promise<MessageWithSender[]> {
  const params: Record<string, string> = { limit: String(limit) };
  if (beforeId) params.before = beforeId;
  const { data } = await apiClient.get<MessageWithSender[]>(
    `${BASE}/conversations/${conversationId}/messages`,
    { params },
  );
  return data;
}

export async function sendMessage(conversationId: string, content: string, replyToMessageId?: string | null): Promise<MessageWithSender> {
  const { data } = await apiClient.post<MessageWithSender>(
    `${BASE}/conversations/${conversationId}/messages`,
    { content, replyToMessageId },
  );
  return data;
}

export async function editMessage(messageId: string, content: string) {
  const { data } = await apiClient.patch<{ content: string; updated_at: string }>(
    `${BASE}/messages/${messageId}`,
    { content },
  );
  return data;
}

export async function deleteMessage(messageId: string) {
  await apiClient.delete(`${BASE}/messages/${messageId}`);
}

export async function markConversationRead(conversationId: string, lastReadMessageId: string) {
  await apiClient.post(`${BASE}/conversations/${conversationId}/read`, { lastReadMessageId });
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>(`${BASE}/unread-count`);
  return data.count;
}

export async function addReaction(messageId: string, emoji: string) {
  await apiClient.post(`${BASE}/messages/${messageId}/reactions`, { emoji });
}

export async function removeReaction(messageId: string, emoji: string) {
  await apiClient.delete(`${BASE}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
}

export async function searchMembers(q: string): Promise<SearchMember[]> {
  const { data } = await apiClient.get<SearchMember[]>(`${BASE}/members/search`, { params: { q } });
  return data;
}

export async function fetchParticipants(conversationId: string): Promise<Participant[]> {
  const { data } = await apiClient.get<Participant[]>(`${BASE}/conversations/${conversationId}/participants`);
  return data;
}

export async function updateConversation(conversationId: string, updates: { title?: string; avatar_url?: string }) {
  await apiClient.patch(`${BASE}/conversations/${conversationId}`, updates);
}

export async function addParticipant(conversationId: string, memberId: number) {
  await apiClient.post(`${BASE}/conversations/${conversationId}/participants`, { memberId });
}

export async function removeParticipant(conversationId: string, memberId: number) {
  await apiClient.delete(`${BASE}/conversations/${conversationId}/participants/${memberId}`);
}
