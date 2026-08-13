/**
 * Админ-мониторинг диалогов с ИИ-помощником.
 * Читает уже сохранённые conversations/messages (kind=assistant),
 * не добавляя админа в участники чата.
 */

import { query as dbQuery } from '../config/db';
import { decryptMessageText } from '../lib/messageCrypto';
import type { MessagePayload, MessageWithSender } from '../types/messenger';
import {
  isMessengerAssistantBotPayload,
  isMessengerAssistantChannelMetadata,
  loadMessages,
  MESSENGER_ASSISTANT_CHANNEL_KIND,
  MESSENGER_ASSISTANT_CHANNEL_TITLE,
} from './messengerService';

export type AssistantMonitorConversation = {
  conversation_id: string;
  owner_member_id: number;
  owner_name: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_avatar_url: string | null;
  owner_phone: string | null;
  owner_app_role: string | null;
  owner_app_roles: string[];
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from: 'user' | 'assistant' | null;
  created_at: string;
  updated_at: string;
};

export type AssistantMonitorActivity = 'all' | 'today' | '7d';
export type AssistantMonitorSort = 'recent' | 'messages' | 'user_messages';

export type AssistantMonitorStats = {
  conversation_count: number;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  active_today_count: number;
  active_7d_count: number;
};

export type AssistantMonitorListResult = {
  items: AssistantMonitorConversation[];
  total: number;
  stats: AssistantMonitorStats;
};

function asString(v: unknown): string {
  return v == null ? '' : String(v);
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function memberDisplayName(row: {
  first_name?: unknown;
  last_name?: unknown;
  name?: unknown;
  id?: unknown;
}): string {
  const first = asNullableString(row.first_name) ?? '';
  const last = asNullableString(row.last_name) ?? '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const name = asNullableString(row.name);
  if (name) return name;
  const id = asNumber(row.id, 0);
  return id > 0 ? `Участник #${id}` : 'Участник';
}

function previewFromContent(raw: unknown, isDeleted: boolean): string | null {
  if (isDeleted) return 'Сообщение удалено';
  const text = decryptMessageText(asString(raw)).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function parseAppRoles(raw: unknown, fallbackRole: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((r) => String(r)).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  const single = asNullableString(fallbackRole);
  return single ? [single] : [];
}

function lastMessageFrom(senderId: unknown, payload: unknown): 'user' | 'assistant' | null {
  if (isMessengerAssistantBotPayload(payload) || senderId == null || senderId === '') {
    return 'assistant';
  }
  return 'user';
}

export async function listAssistantConversationsForAdmin(opts?: {
  search?: string;
  activity?: AssistantMonitorActivity;
  sort?: AssistantMonitorSort;
  limit?: number;
  offset?: number;
}): Promise<AssistantMonitorListResult> {
  const limit = Math.min(100, Math.max(1, Math.floor(opts?.limit ?? 50)));
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const search = (opts?.search ?? '').trim().slice(0, 120);
  const activity: AssistantMonitorActivity =
    opts?.activity === 'today' || opts?.activity === '7d' ? opts.activity : 'all';
  const sort: AssistantMonitorSort =
    opts?.sort === 'messages' || opts?.sort === 'user_messages' ? opts.sort : 'recent';

  const params: unknown[] = [MESSENGER_ASSISTANT_CHANNEL_KIND];
  let searchSql = '';
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    searchSql = `AND (
      lower(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) LIKE $${params.length}
      OR lower(coalesce(m.name, '')) LIKE $${params.length}
      OR lower(coalesce(m.phone_number, '')) LIKE $${params.length}
      OR (c.metadata->>'owner_member_id') LIKE $${params.length}
    )`;
  }

  let activitySql = '';
  if (activity === 'today') {
    activitySql = `AND COALESCE(lm.created_at, c.updated_at) >= (NOW() - INTERVAL '1 day')`;
  } else if (activity === '7d') {
    activitySql = `AND COALESCE(lm.created_at, c.updated_at) >= (NOW() - INTERVAL '7 days')`;
  }

  const orderSql =
    sort === 'messages'
      ? 'ORDER BY COALESCE(cnt.message_count, 0) DESC, COALESCE(lm.created_at, c.updated_at) DESC, c.id DESC'
      : sort === 'user_messages'
        ? 'ORDER BY COALESCE(cnt.user_message_count, 0) DESC, COALESCE(lm.created_at, c.updated_at) DESC, c.id DESC'
        : 'ORDER BY COALESCE(lm.created_at, c.updated_at) DESC, c.id DESC';

  const statsResult = await dbQuery(
    `
    SELECT
      COUNT(DISTINCT c.id)::int AS conversation_count,
      COUNT(msg.id)::int AS message_count,
      COUNT(msg.id) FILTER (
        WHERE msg.sender_id IS NOT NULL
          AND NOT (
            COALESCE((msg.payload->>'assistant')::boolean, false) = true
            OR COALESCE(msg.payload->>'kind', '') = $1
          )
      )::int AS user_message_count,
      COUNT(msg.id) FILTER (
        WHERE msg.sender_id IS NULL
          OR COALESCE((msg.payload->>'assistant')::boolean, false) = true
          OR COALESCE(msg.payload->>'kind', '') = $1
      )::int AS assistant_message_count,
      COUNT(DISTINCT c.id) FILTER (
        WHERE COALESCE(lm.last_at, c.updated_at) >= (NOW() - INTERVAL '1 day')
      )::int AS active_today_count,
      COUNT(DISTINCT c.id) FILTER (
        WHERE COALESCE(lm.last_at, c.updated_at) >= (NOW() - INTERVAL '7 days')
      )::int AS active_7d_count
    FROM conversations c
    LEFT JOIN messages msg ON msg.conversation_id = c.id AND msg.is_deleted = FALSE
    LEFT JOIN LATERAL (
      SELECT mx.created_at AS last_at
      FROM messages mx
      WHERE mx.conversation_id = c.id
      ORDER BY mx.created_at DESC, mx.id DESC
      LIMIT 1
    ) lm ON TRUE
    WHERE c.type = 'channel'
      AND c.metadata->>'kind' = $1
    `,
    [MESSENGER_ASSISTANT_CHANNEL_KIND],
  );

  const statsRow = (statsResult.rows[0] ?? {}) as Record<string, unknown>;
  const stats: AssistantMonitorStats = {
    conversation_count: asNumber(statsRow.conversation_count),
    message_count: asNumber(statsRow.message_count),
    user_message_count: asNumber(statsRow.user_message_count),
    assistant_message_count: asNumber(statsRow.assistant_message_count),
    active_today_count: asNumber(statsRow.active_today_count),
    active_7d_count: asNumber(statsRow.active_7d_count),
  };

  const filteredFromSql = `
    FROM conversations c
    LEFT JOIN members m
      ON m.id = NULLIF(c.metadata->>'owner_member_id', '')::int
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS message_count,
        COUNT(*) FILTER (
          WHERE msg.sender_id IS NOT NULL
            AND NOT (
              COALESCE((msg.payload->>'assistant')::boolean, false) = true
              OR COALESCE(msg.payload->>'kind', '') = $1
            )
        )::int AS user_message_count,
        COUNT(*) FILTER (
          WHERE msg.sender_id IS NULL
            OR COALESCE((msg.payload->>'assistant')::boolean, false) = true
            OR COALESCE(msg.payload->>'kind', '') = $1
        )::int AS assistant_message_count
      FROM messages msg
      WHERE msg.conversation_id = c.id
        AND msg.is_deleted = FALSE
    ) cnt ON TRUE
    LEFT JOIN LATERAL (
      SELECT mx.id, mx.content, mx.is_deleted, mx.sender_id, mx.payload, mx.created_at
      FROM messages mx
      WHERE mx.conversation_id = c.id
      ORDER BY mx.created_at DESC, mx.id DESC
      LIMIT 1
    ) lm ON TRUE
    WHERE c.type = 'channel'
      AND c.metadata->>'kind' = $1
      ${searchSql}
      ${activitySql}
  `;

  const countResult = await dbQuery(
    `SELECT COUNT(*)::int AS total ${filteredFromSql}`,
    params,
  );
  const total = asNumber((countResult.rows[0] as { total?: unknown } | undefined)?.total);

  params.push(limit, offset);
  const listResult = await dbQuery(
    `
    SELECT
      c.id AS conversation_id,
      c.created_at,
      c.updated_at,
      NULLIF(c.metadata->>'owner_member_id', '')::int AS owner_member_id,
      m.first_name AS owner_first_name,
      m.last_name AS owner_last_name,
      m.name AS owner_name_raw,
      m.avatar_url AS owner_avatar_url,
      m.phone_number AS owner_phone,
      m.app_role AS owner_app_role,
      m.app_roles AS owner_app_roles,
      COALESCE(cnt.message_count, 0)::int AS message_count,
      COALESCE(cnt.user_message_count, 0)::int AS user_message_count,
      COALESCE(cnt.assistant_message_count, 0)::int AS assistant_message_count,
      lm.id AS last_message_id,
      lm.content AS last_message_content,
      lm.is_deleted AS last_message_is_deleted,
      lm.sender_id AS last_message_sender_id,
      lm.payload AS last_message_payload,
      lm.created_at AS last_message_at
    ${filteredFromSql}
    ${orderSql}
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
    `,
    params,
  );

  const items: AssistantMonitorConversation[] = listResult.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const ownerId = asNumber(r.owner_member_id);
    const from = lastMessageFrom(r.last_message_sender_id, r.last_message_payload);
    return {
      conversation_id: asString(r.conversation_id),
      owner_member_id: ownerId,
      owner_name: memberDisplayName({
        id: ownerId,
        first_name: r.owner_first_name,
        last_name: r.owner_last_name,
        name: r.owner_name_raw,
      }),
      owner_first_name: asNullableString(r.owner_first_name),
      owner_last_name: asNullableString(r.owner_last_name),
      owner_avatar_url: asNullableString(r.owner_avatar_url),
      owner_phone: asNullableString(r.owner_phone),
      owner_app_role: asNullableString(r.owner_app_role),
      owner_app_roles: parseAppRoles(r.owner_app_roles, r.owner_app_role),
      message_count: asNumber(r.message_count),
      user_message_count: asNumber(r.user_message_count),
      assistant_message_count: asNumber(r.assistant_message_count),
      last_message_at: asNullableString(r.last_message_at),
      last_message_preview: previewFromContent(
        r.last_message_content,
        r.last_message_is_deleted === true,
      ),
      last_message_from: from,
      created_at: asString(r.created_at),
      updated_at: asString(r.updated_at),
    };
  });

  return { items, total, stats };
}

export type AssistantMonitorMessagesResult = {
  conversation: AssistantMonitorConversation;
  messages: Array<
    Pick<
      MessageWithSender,
      | 'id'
      | 'conversation_id'
      | 'sender_id'
      | 'content'
      | 'payload_type'
      | 'payload'
      | 'is_deleted'
      | 'is_edited'
      | 'created_at'
      | 'updated_at'
      | 'sender_name'
      | 'sender_first_name'
      | 'sender_last_name'
    > & { from: 'user' | 'assistant' }
  >;
  has_more: boolean;
};

export async function loadAssistantConversationMessagesForAdmin(
  conversationId: string,
  opts?: { limit?: number; before?: string | null },
): Promise<AssistantMonitorMessagesResult | null> {
  if (!/^\d+$/.test(conversationId)) return null;

  const metaResult = await dbQuery(
    `SELECT id, type, metadata, created_at, updated_at,
            NULLIF(metadata->>'owner_member_id', '')::int AS owner_member_id
     FROM conversations
     WHERE id = $1::bigint
     LIMIT 1`,
    [conversationId],
  );
  const conv = metaResult.rows[0] as
    | {
        id: unknown;
        type: unknown;
        metadata: unknown;
        created_at: unknown;
        updated_at: unknown;
        owner_member_id: unknown;
      }
    | undefined;
  if (!conv || String(conv.type) !== 'channel') return null;
  if (!isMessengerAssistantChannelMetadata(conv.metadata)) return null;

  const ownerId = asNumber(conv.owner_member_id);
  const memberResult =
    ownerId > 0
      ? await dbQuery(
          `SELECT id, first_name, last_name, name, avatar_url, phone_number, app_role, app_roles
           FROM members WHERE id = $1 LIMIT 1`,
          [ownerId],
        )
      : { rows: [] as Record<string, unknown>[] };
  const member = (memberResult.rows[0] ?? {}) as Record<string, unknown>;

  const counts = await dbQuery(
    `
    SELECT
      COUNT(*)::int AS message_count,
      COUNT(*) FILTER (
        WHERE sender_id IS NOT NULL
          AND NOT (
            COALESCE((payload->>'assistant')::boolean, false) = true
            OR COALESCE(payload->>'kind', '') = $2
          )
      )::int AS user_message_count,
      COUNT(*) FILTER (
        WHERE sender_id IS NULL
          OR COALESCE((payload->>'assistant')::boolean, false) = true
          OR COALESCE(payload->>'kind', '') = $2
      )::int AS assistant_message_count
    FROM messages
    WHERE conversation_id = $1::bigint AND is_deleted = FALSE
    `,
    [conversationId, MESSENGER_ASSISTANT_CHANNEL_KIND],
  );
  const countRow = (counts.rows[0] ?? {}) as Record<string, unknown>;

  const lastMsg = await dbQuery(
    `SELECT content, is_deleted, sender_id, payload, created_at
     FROM messages
     WHERE conversation_id = $1::bigint
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [conversationId],
  );
  const last = (lastMsg.rows[0] ?? null) as Record<string, unknown> | null;

  const conversation: AssistantMonitorConversation = {
    conversation_id: conversationId,
    owner_member_id: ownerId,
    owner_name: memberDisplayName({ ...member, id: ownerId }),
    owner_first_name: asNullableString(member.first_name),
    owner_last_name: asNullableString(member.last_name),
    owner_avatar_url: asNullableString(member.avatar_url),
    owner_phone: asNullableString(member.phone_number),
    owner_app_role: asNullableString(member.app_role),
    owner_app_roles: parseAppRoles(member.app_roles, member.app_role),
    message_count: asNumber(countRow.message_count),
    user_message_count: asNumber(countRow.user_message_count),
    assistant_message_count: asNumber(countRow.assistant_message_count),
    last_message_at: last ? asNullableString(last.created_at) : null,
    last_message_preview: last
      ? previewFromContent(last.content, last.is_deleted === true)
      : null,
    last_message_from: last ? lastMessageFrom(last.sender_id, last.payload) : null,
    created_at: asString(conv.created_at),
    updated_at: asString(conv.updated_at),
  };

  const limit = Math.min(100, Math.max(1, Math.floor(opts?.limit ?? 50)));
  const before = opts?.before && /^\d+$/.test(opts.before) ? opts.before : null;
  // viewerId = owner: корректные имена отправителя; реакции админу не нужны
  const viewerId = ownerId > 0 ? ownerId : 0;
  const loaded = await loadMessages(conversationId, viewerId, limit + 1, before);
  const hasMore = loaded.length > limit;
  const slice = hasMore ? loaded.slice(loaded.length - limit) : loaded;

  const messages = slice.map((msg) => {
    const payload = (msg.payload ?? {}) as MessagePayload;
    const from: 'user' | 'assistant' =
      isMessengerAssistantBotPayload(payload) || msg.sender_id == null ? 'assistant' : 'user';
    return {
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      content: msg.content,
      payload_type: msg.payload_type,
      payload,
      is_deleted: msg.is_deleted,
      is_edited: msg.is_edited,
      created_at: msg.created_at,
      updated_at: msg.updated_at,
      sender_name:
        from === 'assistant'
          ? MESSENGER_ASSISTANT_CHANNEL_TITLE
          : msg.sender_name ?? conversation.owner_name,
      sender_first_name: msg.sender_first_name,
      sender_last_name: msg.sender_last_name,
      from,
    };
  });

  return { conversation, messages, has_more: hasMore };
}
