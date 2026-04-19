import { apiClient } from '../../../lib/apiClient';

const BASE = '/api/messenger';
const META_CACHE_TTL_MS = 45_000;
const PINS_CACHE_TTL_MS = 25_000;
const PARTICIPANTS_CACHE_TTL_MS = 45_000;

type CacheEntry<T> = { value: T; expiresAt: number };
const conversationMetaCache = new Map<string, CacheEntry<ConversationMeta>>();
const pinnedCache = new Map<string, CacheEntry<MessageWithSender[]>>();
const participantsCache = new Map<string, CacheEntry<Participant[]>>();

function readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const item = map.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    map.delete(key);
    return null;
  }
  return item.value;
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ─── Types (mirroring backend) ────────────────────────────────

export type ConversationType = 'private' | 'group' | 'channel';
export type ParticipantRole = 'owner' | 'admin' | 'member';

/** Rich message kinds (mirrors server `message_payload_type`). */
export type MessagePayloadType =
  | 'text'
  | 'prayer_request'
  | 'audio'
  | 'image'
  | 'file'
  | 'poll'
  | 'access_request';

export type MessagePayload = Record<string, unknown>;

export type UploadedFile = {
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  updated_at: string;
  default_permissions?: Record<string, boolean>;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
    avatar_url?: string | null;
    last_seen_at?: string | null;
  } | null;
  my_muted?: boolean;
  my_muted_until?: string | null;
  my_ui_pinned?: boolean;
  my_ui_pinned_at?: string | null;
  my_ui_folder?: 'personal' | 'ministry' | null;
}

export interface MessageWithSender {
  id: string;
  conversation_id: string;
  sender_id: number | null;
  /** Если сервер/WS передаёт флаг прочитанности. */
  is_read?: boolean;
  client_msg_id?: string | null;
  content: string;
  payload_type?: MessagePayloadType;
  payload?: MessagePayload;
  /** Серверный счётчик взаимодействий (напр. «Я молюсь»). */
  interaction_count?: number;
  reply_to_message_id: string | null;
  forwarded_from?: unknown;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned?: boolean;
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
  /** For polls: counts per option (same order as `payload.options`). */
  poll_tallies?: number[];
  /** Option indexes the current member voted for. */
  poll_my_options?: number[];
  /** Local-only optimistic status (not persisted in DB). */
  status?: 'sending' | 'sent' | 'error';
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
  avatar_url?: string | null;
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

export async function fetchMessages(
  conversationId: string,
  beforeId?: string,
  limit = 50,
  afterId?: string,
): Promise<MessageWithSender[]> {
  const params: Record<string, string> = { limit: String(limit) };
  if (beforeId) params.before = beforeId;
  if (afterId) params.after = afterId;
  const { data } = await apiClient.get<MessageWithSender[]>(
    `${BASE}/conversations/${conversationId}/messages`,
    { params },
  );
  return data;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  replyToMessageId?: string | null,
  clientMsgId?: string | null,
  payloadType?: MessagePayloadType,
  payload?: MessagePayload,
): Promise<MessageWithSender> {
  // chat id — в path (`:id` на бэке). user id не передаём: apiClient добавляет Authorization: Bearer <token>.
  const { data } = await apiClient.post<MessageWithSender>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { content, replyToMessageId, clientMsgId, payloadType, payload },
  );
  return data;
}

export async function uploadFile(
  file: File,
  opts?: { onProgress?: (pct: number) => void; signal?: AbortSignal },
): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data } = await apiClient.post<UploadedFile>(`/api/messenger/upload`, form, {
        signal: opts?.signal,
        onUploadProgress: (e) => {
          const total = e.total ?? 0;
          const loaded = e.loaded ?? 0;
          if (!total) return;
          const pct = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
          opts?.onProgress?.(pct);
        },
      });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      if (opts?.signal?.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

export async function fetchUploadsHealth(): Promise<{ ok: boolean; storage: 'healthy' | 'unavailable'; reason?: string }> {
  const { data } = await apiClient.get<{ ok: boolean; storage: 'healthy' | 'unavailable'; reason?: string }>(
    `${BASE}/uploads/health`,
  );
  return data;
}

export type EffectivePermissions = Record<string, boolean>;

export type ConversationMeta = {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  updated_at: string;
  default_permissions?: Record<string, boolean>;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** С ручки meta: роль текущего пользователя в этом чате. */
  my_role?: ParticipantRole;
  /** Эффективные права (учёт роли, настроек чата и персональных ограничений). */
  my_effective_permissions?: EffectivePermissions;
  /** id последнего прочитанного сообщения (участник), для перехода к непрочитанным. */
  my_last_read_message_id?: string | null;
};

export async function fetchConversationMeta(
  conversationId: string,
  opts?: { bypassCache?: boolean },
): Promise<ConversationMeta> {
  const cacheKey = String(conversationId);
  if (!opts?.bypassCache) {
    const cached = readCache(conversationMetaCache, cacheKey);
    if (cached) return cached;
  }
  const { data } = await apiClient.get<ConversationMeta>(`${BASE}/conversations/${conversationId}/meta`);
  writeCache(conversationMetaCache, cacheKey, data, META_CACHE_TTL_MS);
  return data;
}

export async function fetchPinnedMessages(conversationId: string, limit = 15): Promise<MessageWithSender[]> {
  const cacheKey = `${conversationId}:${limit}`;
  const cached = readCache(pinnedCache, cacheKey);
  if (cached) return cached;
  const { data } = await apiClient.get<MessageWithSender[]>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/pinned-messages`,
    { params: { limit } },
  );
  writeCache(pinnedCache, cacheKey, data, PINS_CACHE_TTL_MS);
  return data;
}

export async function pinChatMessage(conversationId: string, messageId: string): Promise<void> {
  await apiClient.post(`${BASE}/conversations/${encodeURIComponent(conversationId)}/pins`, { messageId });
  for (const key of pinnedCache.keys()) {
    if (key.startsWith(`${conversationId}:`)) pinnedCache.delete(key);
  }
}

export async function unpinChatMessage(conversationId: string, messageId: string): Promise<void> {
  await apiClient.delete(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`,
  );
  for (const key of pinnedCache.keys()) {
    if (key.startsWith(`${conversationId}:`)) pinnedCache.delete(key);
  }
}

export type ConversationMember = {
  member_id: number;
  role: ParticipantRole;
  joined_at: string;
  muted_until: string | null;
  permissions: Record<string, boolean>;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
  previous_prayer_requests?: Array<{
    cycle_index: number;
    prayer_request: string;
    updated_at: string | null;
  }>;
};

export type PrivateChatProfile = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  app_role: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  birth_date: string | null; // YYYY-MM-DD
  last_seen_at: string | null;
};

export async function fetchConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const { data } = await apiClient.get<ConversationMember[]>(`${BASE}/conversations/${conversationId}/members`);
  return data;
}

export async function fetchPrivateChatProfile(conversationId: string): Promise<PrivateChatProfile> {
  const { data } = await apiClient.get<PrivateChatProfile>(`${BASE}/conversations/${conversationId}/private-profile`);
  return data;
}

export async function patchConversationPermissions(
  conversationId: string,
  patch: { default_permissions?: Record<string, boolean>; settings?: Record<string, unknown> },
) {
  await apiClient.patch(`${BASE}/conversations/${conversationId}/permissions`, patch);
  conversationMetaCache.delete(String(conversationId));
}

export async function patchConversationMember(
  conversationId: string,
  memberId: number,
  patch: { role?: ParticipantRole; permissions?: Record<string, boolean>; muted_until?: string | null },
) {
  await apiClient.patch(`${BASE}/conversations/${conversationId}/members/${memberId}`, patch);
  participantsCache.delete(String(conversationId));
  conversationMetaCache.delete(String(conversationId));
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

export async function markConversationRead(conversationId: string, messageId: string) {
  await apiClient.post(`${BASE}/conversations/${conversationId}/read`, { messageId });
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

export async function votePoll(
  messageId: string,
  optionIndexes: number[],
): Promise<{ tallies: number[]; my_options: number[] }> {
  const { data } = await apiClient.post<{ tallies: number[]; my_options: number[] }>(
    `${BASE}/messages/${encodeURIComponent(messageId)}/poll-vote`,
    { optionIndexes },
  );
  return data;
}

export async function searchMembers(q: string): Promise<SearchMember[]> {
  const { data } = await apiClient.get<SearchMember[]>(`${BASE}/members/search`, { params: { q } });
  return data;
}

export async function searchMessages(conversationId: string, q: string, limit = 50): Promise<MessageWithSender[]> {
  const { data } = await apiClient.get<MessageWithSender[]>(
    `${BASE}/conversations/${conversationId}/search`,
    { params: { q, limit } }
  );
  return data;
}

export async function fetchParticipants(conversationId: string): Promise<Participant[]> {
  const cacheKey = String(conversationId);
  const cached = readCache(participantsCache, cacheKey);
  if (cached) return cached;
  const { data } = await apiClient.get<Participant[]>(`${BASE}/conversations/${conversationId}/participants`);
  writeCache(participantsCache, cacheKey, data, PARTICIPANTS_CACHE_TTL_MS);
  return data;
}

export async function updateConversation(conversationId: string, updates: { title?: string; avatar_url?: string }) {
  await apiClient.patch(`${BASE}/conversations/${conversationId}`, updates);
  conversationMetaCache.delete(String(conversationId));
}

export async function addParticipant(conversationId: string, memberId: number) {
  await apiClient.post(`${BASE}/conversations/${conversationId}/participants`, { memberId });
  participantsCache.delete(String(conversationId));
}

export async function removeParticipant(conversationId: string, memberId: number) {
  await apiClient.delete(`${BASE}/conversations/${conversationId}/participants/${memberId}`);
  participantsCache.delete(String(conversationId));
}

export type PatchMyConversationUiBody = {
  muted?: boolean;
  uiPinned?: boolean;
  uiFolder?: 'personal' | 'ministry' | null;
};

export async function patchMyConversationUi(conversationId: string, body: PatchMyConversationUiBody) {
  await apiClient.patch(`${BASE}/conversations/${encodeURIComponent(conversationId)}/my-ui`, body);
  conversationMetaCache.delete(String(conversationId));
}

export async function searchAllMessages(
  query: string,
  limit = 30,
): Promise<Array<MessageWithSender & { conversationTitle: string }>> {
  const { data } = await apiClient.get<Array<MessageWithSender & { conversationTitle: string }>>(
    `${BASE}/search`,
    { params: { q: query, limit } },
  );
  return data;
}

export async function clearConversationHistory(conversationId: string) {
  await apiClient.post(`${BASE}/conversations/${encodeURIComponent(conversationId)}/clear-history`);
  for (const key of pinnedCache.keys()) {
    if (key.startsWith(`${conversationId}:`)) pinnedCache.delete(key);
  }
}
