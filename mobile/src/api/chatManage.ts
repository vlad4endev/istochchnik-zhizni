import { apiClient } from './client';

const BASE = '/api/messenger';

export type ParticipantRole = 'owner' | 'admin' | 'member';
export type PermissionKey =
  | 'can_send_messages'
  | 'can_send_media'
  | 'can_add_users'
  | 'can_pin_messages'
  | 'can_manage_chat';
export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

export type ChatMeta = {
  id: string;
  type: 'private' | 'group' | 'channel';
  title: string | null;
  avatar_url: string | null;
  default_permissions: PermissionMap;
  settings: Record<string, unknown>;
  my_role: ParticipantRole | null;
  my_effective_permissions: PermissionMap;
};

export type ChatMember = {
  member_id: number;
  role: ParticipantRole;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  permissions: PermissionMap;
};

export type PrivateProfile = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  app_role: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  birth_date: string | null;
  last_seen_at: string | null;
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function sOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function perms(v: unknown): PermissionMap {
  const o = rec(v);
  const out: PermissionMap = {};
  for (const k of [
    'can_send_messages',
    'can_send_media',
    'can_add_users',
    'can_pin_messages',
    'can_manage_chat',
  ] as const) {
    if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  }
  return out;
}
function role(v: unknown): ParticipantRole {
  return v === 'owner' || v === 'admin' ? v : 'member';
}

export async function fetchChatMeta(conversationId: string): Promise<ChatMeta> {
  const { data } = await apiClient.get<unknown>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/meta`,
  );
  const o = rec(data);
  const type = o.type === 'private' || o.type === 'channel' ? o.type : 'group';
  return {
    id: String(o.id ?? conversationId),
    type,
    title: sOrNull(o.title),
    avatar_url: sOrNull(o.avatar_url),
    default_permissions: perms(o.default_permissions),
    settings: rec(o.settings),
    my_role: o.my_role == null ? null : role(o.my_role),
    my_effective_permissions: perms(o.my_effective_permissions),
  };
}

export async function fetchChatMembers(conversationId: string): Promise<ChatMember[]> {
  const { data } = await apiClient.get<unknown>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/members`,
  );
  if (!Array.isArray(data)) return [];
  const out: ChatMember[] = [];
  for (const raw of data) {
    const o = rec(raw);
    const id = Number(o.member_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({
      member_id: id,
      role: role(o.role),
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `Участник ${id}`,
      first_name: sOrNull(o.first_name),
      last_name: sOrNull(o.last_name),
      avatar_url: sOrNull(o.avatar_url),
      is_online: o.is_online === true,
      last_seen_at: sOrNull(o.last_seen_at),
      permissions: perms(o.permissions),
    });
  }
  return out;
}

export async function fetchPrivateProfile(conversationId: string): Promise<PrivateProfile> {
  const { data } = await apiClient.get<unknown>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/private-profile`,
  );
  const o = rec(data);
  return {
    id: Number(o.id) || 0,
    name: typeof o.name === 'string' ? o.name : '',
    first_name: sOrNull(o.first_name),
    last_name: sOrNull(o.last_name),
    avatar_url: sOrNull(o.avatar_url),
    phone_number: sOrNull(o.phone_number),
    app_role: sOrNull(o.app_role),
    ministry_role: sOrNull(o.ministry_role),
    ministry_direction: sOrNull(o.ministry_direction),
    birth_date: sOrNull(o.birth_date),
    last_seen_at: sOrNull(o.last_seen_at),
  };
}

/** Разрешения по умолчанию и настройки чата (например, описание). */
export async function patchChatPermissions(
  conversationId: string,
  patch: { default_permissions?: PermissionMap; settings?: Record<string, unknown> },
): Promise<void> {
  await apiClient.patch(`${BASE}/conversations/${encodeURIComponent(conversationId)}/permissions`, patch);
}

export async function patchChatMember(
  conversationId: string,
  memberId: number,
  patch: { role?: ParticipantRole; permissions?: PermissionMap },
): Promise<void> {
  await apiClient.patch(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/members/${memberId}`,
    patch,
  );
}

export async function updateChat(
  conversationId: string,
  updates: { title?: string; avatar_url?: string | null },
): Promise<void> {
  await apiClient.patch(`${BASE}/conversations/${encodeURIComponent(conversationId)}`, updates);
}

export async function addChatParticipant(conversationId: string, memberId: number): Promise<void> {
  await apiClient.post(`${BASE}/conversations/${encodeURIComponent(conversationId)}/participants`, {
    memberId,
  });
}

/** Удалить участника; для самого себя — «выйти из чата» (владелец удаляет чат для всех). */
export async function removeChatParticipant(conversationId: string, memberId: number): Promise<void> {
  await apiClient.delete(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/participants/${memberId}`,
  );
}

export async function clearChatHistory(conversationId: string): Promise<void> {
  await apiClient.post(`${BASE}/conversations/${encodeURIComponent(conversationId)}/clear-history`);
}
