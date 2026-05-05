import axios from 'axios';

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
  | 'video_note'
  | 'image'
  | 'file'
  | 'poll'
  | 'access_request';

export type MessagePayload = Record<string, unknown>;

export type UploadedFile = {
  url: string;
  name: string;
  objectPath?: string;
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

export type ConversationListRow = ConversationListItem & { avatarUrl?: string | null };

/** Сброс кэша браузера для аватара при смене `updated_at` чата / участника. */
function withAvatarCacheBust(url: string | null, versionIso: string | null | undefined): string | null {
  if (!url) return null;
  const t = versionIso ? Date.parse(String(versionIso)) : NaN;
  if (!Number.isFinite(t)) return url;
  if (/[?&]v=\d/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${t}`;
}

function firstNonEmptyString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickConversationAvatarCandidate(c: ConversationListRow): string | null {
  const direct = firstNonEmptyString(c.avatar_url, c.avatarUrl);
  if (direct) return direct;

  const metadata = c.metadata && typeof c.metadata === 'object' && !Array.isArray(c.metadata)
    ? (c.metadata as Record<string, unknown>)
    : null;
  const settings = c.settings && typeof c.settings === 'object' && !Array.isArray(c.settings)
    ? (c.settings as Record<string, unknown>)
    : null;

  const nestedCandidates = [
    metadata?.avatar_url,
    metadata?.avatarUrl,
    metadata?.photo_url,
    metadata?.photoUrl,
    metadata?.logo_url,
    metadata?.logoUrl,
    settings?.avatar_url,
    settings?.avatarUrl,
    settings?.photo_url,
    settings?.photoUrl,
    settings?.logo_url,
    settings?.logoUrl,
  ];
  for (const value of nestedCandidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function normalizeConversationListItem(c: ConversationListRow): ConversationListItem {
  const avatarBase = pickConversationAvatarCandidate(c);
  const avatar_url = withAvatarCacheBust(avatarBase, c.updated_at ?? null);
  const omIn = c.other_member as (NonNullable<ConversationListItem['other_member']> & {
    avatarUrl?: string | null;
  }) | null;
  const om = omIn
    ? {
        ...omIn,
        avatar_url: (() => {
          const raw = omIn.avatar_url ?? omIn.avatarUrl ?? null;
          const trimmed = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
          return withAvatarCacheBust(trimmed, c.updated_at ?? null);
        })(),
      }
    : null;
  return {
    ...c,
    id: String(c.id),
    avatar_url,
    other_member: om,
  };
}

export interface MessageWithSender {
  id: string;
  conversation_id: string;
  sender_id: number | null;
  /** Если сервер/WS передаёт флаг прочитанности. */
  is_read?: boolean;
  client_msg_id?: string | null;
  content: string;
  /** Редкий вариант API: тип сообщения на верхнем уровне (вместо payload_type). */
  type?: MessagePayloadType | string;
  /** Прямая ссылка на изображение (альтернатива payload.url). */
  image_url?: string | null;
  imageUrl?: string | null;
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
  status?: 'sending' | 'sent' | 'delivered' | 'error';
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
  const { data } = await apiClient.get<ConversationListRow[]>(`${BASE}/conversations`);
  return (data ?? []).map(normalizeConversationListItem);
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
  opts?: { onProgress?: (pct: number) => void; signal?: AbortSignal; conversationId?: string | null },
): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  const conv = typeof opts?.conversationId === 'string' ? opts.conversationId.trim() : '';
  if (conv) form.append('conversationId', conv);
  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data } = await apiClient.post<UploadedFile>(`/api/messenger/upload`, form, {
        timeout: 3_600_000,
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
  if (axios.isAxiosError(lastError)) {
    const data = lastError.response?.data as { error?: string; code?: string } | undefined;
    const msg = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : lastError.message;
    const err = new Error(msg) as Error & { code?: string };
    if (typeof data?.code === 'string') err.code = data.code;
    throw err;
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const attachmentUrlCache = new Map<string, { url: string; expiresAtMs: number }>();

function attachmentUrlCacheKey(messageId: string, slot?: number): string {
  if (slot == null || !Number.isFinite(slot)) return String(messageId);
  return `${messageId}:slot:${Math.floor(slot)}`;
}

export async function fetchMessageAttachmentUrl(
  messageId: string,
  slot?: number,
): Promise<{ url: string }> {
  const key = attachmentUrlCacheKey(messageId, slot);
  const now = Date.now();
  const cached = attachmentUrlCache.get(key);
  if (cached && cached.expiresAtMs > now + 5000) {
    return { url: cached.url };
  }
  const qs = slot != null && Number.isFinite(slot) ? `?slot=${encodeURIComponent(String(Math.floor(slot)))}` : '';
  const { data } = await apiClient.get<{ url: string; source: 'signed' | 'stored'; expiresAt?: string }>(
    `${BASE}/messages/${encodeURIComponent(messageId)}/attachment-url${qs}`,
  );
  const expiresAtMs = data.expiresAt ? Date.parse(data.expiresAt) : now + 5 * 60 * 1000;
  if (data.url) {
    attachmentUrlCache.set(key, {
      url: data.url,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 5 * 60 * 1000,
    });
  }
  return { url: data.url };
}

/**
 * Same-origin URL для открытия/скачивания вложения (сессия в cookie).
 * Обходит CORS Supabase при сохранении файла и даёт стабильное «Открыть» в новой вкладке.
 */
export function buildMessengerAttachmentFileUrl(
  messageId: string,
  opts?: { download?: boolean; slot?: number },
): string {
  const qs = new URLSearchParams();
  if (opts?.download) qs.set('download', '1');
  if (opts?.slot != null && Number.isFinite(opts.slot)) {
    qs.set('slot', String(Math.floor(opts.slot)));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return `${BASE}/messages/${encodeURIComponent(messageId)}/attachment-file${suffix}`;
}

export type MessengerUploadsHealth = {
  ok: boolean;
  storage: 'supabase' | 'unavailable' | 'healthy';
  reason?: string;
  bucket?: string;
  hint?: string;
  missingEnv?: string[];
  existingBuckets?: string[];
  bucketCheck?: { inconclusive?: boolean; reason?: string; message?: string };
};

export async function fetchUploadsHealth(): Promise<MessengerUploadsHealth> {
  const { data } = await apiClient.get<MessengerUploadsHealth>(`${BASE}/uploads/health`);
  return data ?? { ok: false, storage: 'unavailable', reason: 'empty_response' };
}

export type EffectivePermissions = Record<string, boolean>;

export type ConversationMeta = {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  description?: string | null;
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
  is_online?: boolean;
  last_seen_at?: string | null;
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

export async function markConversationRead(
  conversationId: string,
  input: { messageId?: string | null; readAt?: string | null },
) {
  await apiClient.post(`${BASE}/conversations/${conversationId}/read`, {
    messageId: input.messageId ?? null,
    readAt: input.readAt ?? null,
  });
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

export type PollVoter = {
  member_id: number;
  display_name: string;
  avatar_url: string | null;
};

export type PollVotersResponse = {
  conversationId: string;
  anonymous?: boolean;
  options: Array<{ index: number; voters: PollVoter[] }>;
};

export async function fetchPollVoters(messageId: string): Promise<PollVotersResponse> {
  const { data } = await apiClient.get<PollVotersResponse>(
    `${BASE}/messages/${encodeURIComponent(messageId)}/poll-voters`,
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

export async function updateConversation(
  conversationId: string,
  updates: { title?: string; avatar_url?: string | null; description?: string | null },
) {
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
