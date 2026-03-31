import { query as dbQuery } from '../config/db';
import type {
  ConversationListItem,
  ConversationType,
  ConversationMember,
  MessagePayload,
  MessagePayloadType,
  MessageWithSender,
  ParticipantRole,
  PermissionsJson,
} from '../types/messenger';

// ─── Helpers ──────────────────────────────────────────────────

function bigint(v: unknown): string {
  return String(v);
}

function pgErrorCode(e: unknown): string | undefined {
  const c =
    e && typeof e === 'object' && 'code' in e ? (e as { code: unknown }).code : undefined;
  if (typeof c === 'string') return c;
  if (typeof c === 'number') return String(c);
  return undefined;
}

function isPgUndefinedColumnError(e: unknown): boolean {
  return pgErrorCode(e) === '42703';
}

/**
 * Права/мьют участника для checkChatPermission. Несколько вариантов SELECT на случай старой БД без
 * колонок `left_at`, `permissions` и т.д. (иначе middleware ловит 500 «Failed to authorize chat action»).
 */
export async function getParticipantChatAuthRow(
  conversationId: string,
  memberId: number,
): Promise<{ permissions: PermissionsJson; muted_until: string | null }> {
  const attempts: Array<{ sql: string; muteOnly: boolean }> = [
    {
      sql: `SELECT permissions, muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
            LIMIT 1`,
      muteOnly: false,
    },
    {
      sql: `SELECT permissions, muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2
            LIMIT 1`,
      muteOnly: false,
    },
    {
      sql: `SELECT muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
            LIMIT 1`,
      muteOnly: true,
    },
    {
      sql: `SELECT muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2
            LIMIT 1`,
      muteOnly: true,
    },
    {
      sql: `SELECT 1 AS present FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2
            LIMIT 1`,
      muteOnly: false,
    },
  ];

  for (const { sql, muteOnly } of attempts) {
    try {
      const result = await dbQuery(sql, [conversationId, memberId]);
      const row = result.rows[0];
      if (!row) {
        continue;
      }
      if ('present' in row) {
        return { permissions: {}, muted_until: null };
      }
      if (muteOnly) {
        return { permissions: {}, muted_until: (row.muted_until as string | null) ?? null };
      }
      return {
        permissions: (row.permissions ?? {}) as PermissionsJson,
        muted_until: (row.muted_until as string | null) ?? null,
      };
    } catch (e) {
      if (!isPgUndefinedColumnError(e)) {
        throw e;
      }
      console.warn(
        '[messenger] getParticipantChatAuthRow: fallback (42703 undefined column), trying simpler SELECT',
        (e as Error)?.message,
      );
    }
  }
  console.warn('[messenger] getParticipantChatAuthRow: no matching row from fallbacks, using empty overrides');
  return { permissions: {}, muted_until: null };
}

// ─── Conversations ────────────────────────────────────────────

/**
 * List conversations the member participates in, sorted by last activity.
 * Includes last message preview and unread count.
 */
export async function listConversations(memberId: number): Promise<ConversationListItem[]> {
  const result = await dbQuery(
    `
    SELECT
      c.id,
      c.type,
      c.title,
      c.avatar_url,
      c.updated_at,
      -- last message
      lm.id          AS lm_id,
      lm.content     AS lm_content,
      lm.sender_id   AS lm_sender_id,
      lm.created_at  AS lm_created_at,
      lm.is_deleted  AS lm_is_deleted,
      COALESCE(lm_sender.first_name, '') || ' ' || COALESCE(lm_sender.last_name, '') AS lm_sender_name,
      -- unread count
      COALESCE(
        (SELECT COUNT(*)::int FROM messages m2
         WHERE m2.conversation_id = c.id
           AND m2.id > COALESCE(rr.last_read_message_id, 0)),
        0
      ) AS unread_count,
      -- other member for private chats
      om.id          AS om_id,
      om.name        AS om_name,
      om.first_name  AS om_first_name,
      om.last_name   AS om_last_name,
      om.avatar_url  AS om_avatar_url
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    -- last message via lateral
    LEFT JOIN LATERAL (
      SELECT m.id, m.content, m.sender_id, m.created_at, m.is_deleted
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN members lm_sender ON lm_sender.id = lm.sender_id
    -- read receipt
    LEFT JOIN read_receipts rr ON rr.conversation_id = c.id AND rr.member_id = $1
    -- other member for private chats
    LEFT JOIN LATERAL (
      SELECT om2.id, om2.name, om2.first_name, om2.last_name, om2.avatar_url
      FROM conversation_participants op
      JOIN members om2 ON om2.id = op.member_id
      WHERE op.conversation_id = c.id
        AND op.member_id != $1
        AND op.left_at IS NULL
        AND c.type = 'private'
      LIMIT 1
    ) om ON TRUE
    WHERE cp.member_id = $1
      AND cp.left_at IS NULL
    ORDER BY c.updated_at DESC
    `,
    [memberId],
  );

  return result.rows.map((r: any) => ({
    id: bigint(r.id),
    type: r.type as ConversationType,
    title: r.title,
    avatar_url: r.avatar_url,
    updated_at: r.updated_at,
    last_message: r.lm_id
      ? {
          id: bigint(r.lm_id),
          content: r.lm_content,
          sender_id: r.lm_sender_id,
          sender_name: r.lm_sender_name?.trim() || null,
          created_at: r.lm_created_at,
          is_deleted: r.lm_is_deleted,
        }
      : null,
    unread_count: Number(r.unread_count),
    other_member: r.om_id
      ? {
          id: r.om_id,
          name: r.om_name,
          first_name: r.om_first_name,
          last_name: r.om_last_name,
          avatar_url: r.om_avatar_url ?? null,
        }
      : null,
  }));
}

export async function getConversationMeta(
  conversationId: string,
): Promise<Pick<
  ConversationListItem,
  'id' | 'type' | 'title' | 'avatar_url' | 'updated_at' | 'default_permissions' | 'settings' | 'metadata'
> | null> {
  function mapMetaRowFromDbRow(r: Record<string, unknown>): Pick<
    ConversationListItem,
    'id' | 'type' | 'title' | 'avatar_url' | 'updated_at' | 'default_permissions' | 'settings' | 'metadata'
  > {
    const metaRaw = r.metadata;
    const metadata =
      metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
        ? (metaRaw as Record<string, unknown>)
        : undefined;
    const dp = r.default_permissions;
    const default_permissions =
      dp && typeof dp === 'object' && !Array.isArray(dp) ? (dp as PermissionsJson) : undefined;
    const st = r.settings;
    const settings =
      st && typeof st === 'object' && !Array.isArray(st) ? (st as Record<string, unknown>) : undefined;
    return {
      id: bigint(r.id),
      type: r.type as ConversationType,
      title: r.title as string | null,
      avatar_url: r.avatar_url as string | null,
      updated_at: r.updated_at as string,
      default_permissions,
      settings,
      metadata,
    };
  }

  const sqlAttempts = [
    `SELECT id, type, title, avatar_url, updated_at, default_permissions, settings, metadata
     FROM conversations WHERE id = $1 LIMIT 1`,
    `SELECT id, type, title, avatar_url, updated_at, default_permissions, settings
     FROM conversations WHERE id = $1 LIMIT 1`,
    `SELECT id, type, title, avatar_url, updated_at, default_permissions
     FROM conversations WHERE id = $1 LIMIT 1`,
    `SELECT id, type, title, avatar_url, updated_at
     FROM conversations WHERE id = $1 LIMIT 1`,
  ];

  let lastErr: unknown;
  for (let i = 0; i < sqlAttempts.length; i++) {
    try {
      const result = await dbQuery(sqlAttempts[i], [conversationId]);
      const row = result.rows[0];
      if (!row) return null;
      return mapMetaRowFromDbRow(row as Record<string, unknown>);
    } catch (e) {
      lastErr = e;
      if (pgErrorCode(e) !== '42703') {
        throw e;
      }
      console.warn(
        `[messenger] getConversationMeta: 42703 on attempt ${i + 1}/${sqlAttempts.length}, retrying simpler SELECT`,
        (e as Error)?.message,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function updateConversationPermissionsAndSettings(
  conversationId: string,
  patch: {
    default_permissions?: PermissionsJson;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    title?: string;
    avatar_url?: string | null;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (patch.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(patch.title);
  }
  if (patch.avatar_url !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    params.push(patch.avatar_url);
  }
  if (patch.default_permissions !== undefined) {
    sets.push(`default_permissions = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.default_permissions));
  }
  if (patch.settings !== undefined) {
    sets.push(`settings = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.settings));
  }
  if (patch.metadata !== undefined) {
    sets.push(`metadata = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.metadata));
  }

  if (sets.length === 0) return;
  params.push(conversationId);

  await dbQuery(`UPDATE conversations SET ${sets.join(', ')} WHERE id = $${i}`, params);
}

export async function listConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const result = await dbQuery(
    `SELECT
        cp.member_id,
        cp.role,
        cp.joined_at,
        cp.muted_until,
        cp.permissions,
        m.name,
        m.first_name,
        m.last_name
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1
       AND cp.left_at IS NULL
     ORDER BY
       CASE cp.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       cp.joined_at ASC`,
    [conversationId],
  );
  return result.rows.map((r: any) => ({
    member_id: Number(r.member_id),
    role: r.role as ParticipantRole,
    joined_at: r.joined_at,
    muted_until: r.muted_until ?? null,
    permissions: (r.permissions ?? {}) as PermissionsJson,
    name: r.name,
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
  }));
}

export async function updateMemberRoleAndPermissions(
  conversationId: string,
  memberId: number,
  patch: { role?: ParticipantRole; permissions?: PermissionsJson; muted_until?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (patch.role !== undefined) {
    sets.push(`role = $${i++}`);
    params.push(patch.role);
  }
  if (patch.permissions !== undefined) {
    sets.push(`permissions = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.permissions));
  }
  if (patch.muted_until !== undefined) {
    sets.push(`muted_until = $${i++}`);
    params.push(patch.muted_until);
  }
  if (sets.length === 0) return;

  params.push(conversationId, memberId);
  await dbQuery(
    `UPDATE conversation_participants
     SET ${sets.join(', ')}
     WHERE conversation_id = $${i++} AND member_id = $${i} AND left_at IS NULL`,
    params,
  );
}

/**
 * Fetch a single conversation list item shaped for a specific member.
 * (Important: `other_member` for private chats must be computed from the recipient's POV.)
 */
export async function getConversationListItem(
  memberId: number,
  conversationId: string,
): Promise<ConversationListItem | null> {
  const result = await dbQuery(
    `
    SELECT
      c.id,
      c.type,
      c.title,
      c.avatar_url,
      c.updated_at,
      -- last message
      lm.id          AS lm_id,
      lm.content     AS lm_content,
      lm.sender_id   AS lm_sender_id,
      lm.created_at  AS lm_created_at,
      lm.is_deleted  AS lm_is_deleted,
      COALESCE(lm_sender.first_name, '') || ' ' || COALESCE(lm_sender.last_name, '') AS lm_sender_name,
      -- unread count
      COALESCE(
        (SELECT COUNT(*)::int FROM messages m2
         WHERE m2.conversation_id = c.id
           AND m2.id > COALESCE(rr.last_read_message_id, 0)),
        0
      ) AS unread_count,
      -- other member for private chats
      om.id          AS om_id,
      om.name        AS om_name,
      om.first_name  AS om_first_name,
      om.last_name   AS om_last_name,
      om.avatar_url  AS om_avatar_url
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.content, m.sender_id, m.created_at, m.is_deleted
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN members lm_sender ON lm_sender.id = lm.sender_id
    LEFT JOIN read_receipts rr ON rr.conversation_id = c.id AND rr.member_id = $1
    LEFT JOIN LATERAL (
      SELECT om2.id, om2.name, om2.first_name, om2.last_name, om2.avatar_url
      FROM conversation_participants op
      JOIN members om2 ON om2.id = op.member_id
      WHERE op.conversation_id = c.id
        AND op.member_id != $1
        AND op.left_at IS NULL
        AND c.type = 'private'
      LIMIT 1
    ) om ON TRUE
    WHERE cp.member_id = $1
      AND cp.left_at IS NULL
      AND c.id = $2
    LIMIT 1
    `,
    [memberId, conversationId],
  );

  const r = result.rows[0];
  if (!r) return null;

  return {
    id: bigint(r.id),
    type: r.type as ConversationType,
    title: r.title,
    avatar_url: r.avatar_url,
    updated_at: r.updated_at,
    last_message: r.lm_id
      ? {
          id: bigint(r.lm_id),
          content: r.lm_content,
          sender_id: r.lm_sender_id,
          sender_name: r.lm_sender_name?.trim() || null,
          created_at: r.lm_created_at,
          is_deleted: r.lm_is_deleted,
        }
      : null,
    unread_count: Number(r.unread_count),
    other_member: r.om_id
      ? {
          id: r.om_id,
          name: r.om_name,
          first_name: r.om_first_name,
          last_name: r.om_last_name,
          avatar_url: r.om_avatar_url ?? null,
        }
      : null,
  };
}

/**
 * Find or create a private (P2P) conversation between two members.
 */
export async function findOrCreatePersonalConversation(
  memberA: number,
  memberB: number,
): Promise<string> {
  if (memberA === memberB) throw new Error('Cannot create chat with yourself');

  // Check if private conversation already exists
  const existing = await dbQuery(
    `
    SELECT cp1.conversation_id
    FROM conversation_participants cp1
    JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
    JOIN conversations c ON c.id = cp1.conversation_id
    WHERE cp1.member_id = $1
      AND cp2.member_id = $2
      AND cp1.left_at IS NULL
      AND cp2.left_at IS NULL
      AND c.type = 'private'
    LIMIT 1
    `,
    [memberA, memberB],
  );

  if (existing.rows[0]) {
    return bigint(existing.rows[0].conversation_id);
  }

  // Create new
  const conv = await dbQuery(
    `INSERT INTO conversations (type) VALUES ('private') RETURNING id`,
  );
  const convId = bigint(conv.rows[0].id);

  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
    [convId, memberA, memberB],
  );

  return convId;
}

/**
 * Create a group or channel conversation.
 */
export async function createGroupConversation(
  creatorId: number,
  title: string,
  type: 'group' | 'channel',
  memberIds: number[],
): Promise<string> {
  const conv = await dbQuery(
    `INSERT INTO conversations (type, title) VALUES ($1, $2) RETURNING id`,
    [type, title.trim()],
  );
  const convId = bigint(conv.rows[0].id);

  // Creator is owner
  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, 'owner')`,
    [convId, creatorId],
  );

  // Add members
  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== creatorId))];
  for (const mId of uniqueMembers) {
    await dbQuery(
      `INSERT INTO conversation_participants (conversation_id, member_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [convId, mId],
    );
  }

  return convId;
}

/**
 * Check if member is active participant in conversation.
 */
export async function isMemberInConversation(
  conversationId: string,
  memberId: number,
): Promise<boolean> {
  const result = await dbQuery(
    `SELECT 1 FROM conversation_participants
     WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [conversationId, memberId],
  );
  return result.rows.length > 0;
}

/**
 * Get participant role in a conversation.
 */
export async function getParticipantRole(
  conversationId: string,
  memberId: number,
): Promise<ParticipantRole | null> {
  try {
    const result = await dbQuery(
      `SELECT role FROM conversation_participants
       WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
       LIMIT 1`,
      [conversationId, memberId],
    );
    return (result.rows[0]?.role as ParticipantRole) ?? null;
  } catch (e) {
    if (!isPgUndefinedColumnError(e)) {
      throw e;
    }
    console.warn(
      '[messenger] getParticipantRole: retrying without left_at (column missing on older DB)',
      (e as Error)?.message,
    );
    const legacy = await dbQuery(
      `SELECT role FROM conversation_participants
       WHERE conversation_id = $1 AND member_id = $2
       LIMIT 1`,
      [conversationId, memberId],
    );
    return (legacy.rows[0]?.role as ParticipantRole) ?? null;
  }
}

/**
 * Get conversation type.
 */
export async function getConversationType(
  conversationId: string,
): Promise<ConversationType | null> {
  const result = await dbQuery(
    `SELECT type FROM conversations WHERE id = $1 LIMIT 1`,
    [conversationId],
  );
  return (result.rows[0]?.type as ConversationType) ?? null;
}

/**
 * Get active participant member IDs for a conversation.
 */
export async function getConversationMemberIds(conversationId: string): Promise<number[]> {
  const result = await dbQuery(
    `SELECT member_id FROM conversation_participants
     WHERE conversation_id = $1 AND left_at IS NULL`,
    [conversationId],
  );
  return result.rows.map((r: any) => Number(r.member_id));
}

/**
 * Get conversation participants with member info.
 */
export async function getConversationParticipants(conversationId: string) {
  const result = await dbQuery(
    `SELECT
       cp.member_id,
       cp.role,
       cp.joined_at,
       m.name,
       m.first_name,
       m.last_name
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1 AND cp.left_at IS NULL
     ORDER BY cp.joined_at ASC`,
    [conversationId],
  );
  return result.rows;
}

/**
 * Add a member to a group/channel conversation.
 */
export async function addParticipant(
  conversationId: string,
  memberId: number,
  role: ParticipantRole = 'member',
): Promise<void> {
  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, member_id) DO UPDATE
     SET left_at = NULL, role = $3, joined_at = NOW()`,
    [conversationId, memberId, role],
  );
}

/**
 * Remove a member (soft-delete: set left_at).
 */
export async function removeParticipant(
  conversationId: string,
  memberId: number,
): Promise<void> {
  await dbQuery(
    `UPDATE conversation_participants SET left_at = NOW()
     WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
    [conversationId, memberId],
  );
}

/**
 * Update conversation title/avatar.
 */
export async function updateConversation(
  conversationId: string,
  updates: { title?: string; avatar_url?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(updates.title.trim());
  }
  if (updates.avatar_url !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    params.push(updates.avatar_url);
  }
  if (sets.length === 0) return;

  params.push(conversationId);
  await dbQuery(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = $${i}`,
    params,
  );
}

export type PrivateChatProfile = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  /** “Роль в проекте” */
  app_role: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  birth_date: string | null;
};

export async function getPrivateChatProfile(
  conversationId: string,
  requesterMemberId: number,
): Promise<PrivateChatProfile | null> {
  const result = await dbQuery(
    `
    SELECT
      m.id,
      m.name,
      m.first_name,
      m.last_name,
      m.phone_number,
      m.app_role,
      m.ministry_role,
      m.ministry_direction,
      m.birth_date
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    JOIN members m ON m.id = cp.member_id
    WHERE cp.conversation_id = $1
      AND cp.left_at IS NULL
      AND c.type = 'private'
      AND cp.member_id <> $2
    LIMIT 1
    `,
    [conversationId, requesterMemberId],
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    name: r.name,
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
    phone_number: r.phone_number ?? null,
    app_role: r.app_role ?? null,
    ministry_role: r.ministry_role ?? null,
    ministry_direction: r.ministry_direction ?? null,
    birth_date: r.birth_date ? new Date(r.birth_date).toISOString().slice(0, 10) : null,
  };
}

// ─── Messages ─────────────────────────────────────────────────

function normalizePayloadType(raw: unknown): MessagePayloadType {
  if (raw === 'prayer_request' || raw === 'audio') return raw;
  return 'text';
}

function normalizePayload(raw: unknown): MessagePayload {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as MessagePayload;
  }
  return {};
}

/** Send a message. Returns the full message with sender info. */
export async function sendMessage(
  conversationId: string,
  senderId: number,
  content: string,
  replyToMessageId?: string | null,
  clientMsgId?: string | null,
  payloadType: MessagePayloadType = 'text',
  payload: MessagePayload = {},
): Promise<MessageWithSender> {
  const pt = normalizePayloadType(payloadType);
  const plRaw = normalizePayload(payload);
  const pl: MessagePayload = pt === 'text' && Object.keys(plRaw).length === 0
    ? { text: content.trim() }
    : plRaw;
  const payloadJson = JSON.stringify(pl);

  // For consistent ordering in `/conversations` across clients.
  await dbQuery(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

  const result = await dbQuery(
    `
    WITH inserted AS (
      INSERT INTO messages (conversation_id, sender_id, content, reply_to_message_id, client_msg_id, payload_type, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      -- Match partial unique index idx_messages_client_dedupe (WHERE client_msg_id IS NOT NULL).
      ON CONFLICT (conversation_id, sender_id, client_msg_id) WHERE client_msg_id IS NOT NULL
      DO UPDATE SET
        content = EXCLUDED.content,
        payload_type = EXCLUDED.payload_type,
        payload = EXCLUDED.payload
      RETURNING *
    )
    SELECT
      ins.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      -- reply preview
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name
    FROM inserted ins
    LEFT JOIN members m ON m.id = ins.sender_id
    LEFT JOIN messages rm ON rm.id = ins.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    `,
    [conversationId, senderId, content.trim(), replyToMessageId || null, clientMsgId || null, pt, payloadJson],
  );

  return mapMessageWithSender(result.rows[0], senderId);
}

/**
 * Load messages for a conversation with cursor-based pagination.
 * Returns messages before `beforeId` (or latest if null).
 */
export async function loadMessages(
  conversationId: string,
  memberId: number,
  limit: number = 50,
  beforeId?: string | null,
): Promise<MessageWithSender[]> {
  const params: unknown[] = [conversationId, limit];
  let whereCursor = '';

  if (beforeId) {
    whereCursor = 'AND msg.id < $3';
    params.push(beforeId);
  }

  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      -- reply preview
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      -- reactions aggregated
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $${params.length + 1}) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json
    FROM messages msg
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.conversation_id = $1 ${whereCursor}
    ORDER BY msg.id DESC
    LIMIT $2
    `,
    [...params, memberId],
  );

  return result.rows.map((r: any) => mapMessageWithSender(r, memberId)).reverse();
}

/**
 * Edit message content (only by sender).
 */
export async function editMessage(
  messageId: string,
  senderId: number,
  newContent: string,
): Promise<{ content: string; updated_at: string } | null> {
  const result = await dbQuery(
    `UPDATE messages
     SET
       content = $1,
       payload = CASE
         WHEN payload_type::text = 'text' THEN jsonb_build_object('text', $1)
         ELSE payload
       END
     WHERE id = $2 AND sender_id = $3 AND is_deleted = FALSE
     RETURNING content, updated_at`,
    [newContent.trim(), messageId, senderId],
  );
  return result.rows[0] ?? null;
}

/**
 * Soft-delete a message (only by sender).
 */
export async function deleteMessage(
  messageId: string,
  senderId: number,
): Promise<boolean> {
  const result = await dbQuery(
    `UPDATE messages SET is_deleted = TRUE, content = ''
     WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE
     RETURNING id`,
    [messageId, senderId],
  );
  return result.rows.length > 0;
}

// ─── Read Receipts ────────────────────────────────────────────

/**
 * Mark messages as read up to a given message ID.
 */
export async function markRead(
  conversationId: string,
  memberId: number,
  lastReadMessageId: string,
): Promise<void> {
  await dbQuery(
    `INSERT INTO read_receipts (conversation_id, member_id, last_read_message_id, read_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (conversation_id, member_id) DO UPDATE
     SET last_read_message_id = GREATEST(read_receipts.last_read_message_id, $3),
         read_at = NOW()`,
    [conversationId, memberId, lastReadMessageId],
  );
}

/**
 * Get total unread count across all conversations for a member.
 */
export async function getTotalUnreadCount(memberId: number): Promise<number> {
  const result = await dbQuery(
    `
    SELECT COALESCE(SUM(cnt), 0)::int AS total
    FROM (
      SELECT COUNT(*) AS cnt
      FROM conversation_participants cp
      JOIN messages m ON m.conversation_id = cp.conversation_id
      LEFT JOIN read_receipts rr ON rr.conversation_id = cp.conversation_id AND rr.member_id = $1
      WHERE cp.member_id = $1
        AND cp.left_at IS NULL
        AND m.id > COALESCE(rr.last_read_message_id, 0)
    ) sub
    `,
    [memberId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

// ─── Reactions ────────────────────────────────────────────────

export async function addReaction(
  messageId: string,
  memberId: number,
  emoji: string,
): Promise<boolean> {
  const result = await dbQuery(
    `INSERT INTO message_reactions (message_id, member_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING message_id`,
    [messageId, memberId, emoji],
  );
  return result.rows.length > 0;
}

export async function removeReaction(
  messageId: string,
  memberId: number,
  emoji: string,
): Promise<boolean> {
  const result = await dbQuery(
    `DELETE FROM message_reactions
     WHERE message_id = $1 AND member_id = $2 AND emoji = $3
     RETURNING message_id`,
    [messageId, memberId, emoji],
  );
  return result.rows.length > 0;
}

export async function getMessageConversationId(messageId: string): Promise<string | null> {
  const result = await dbQuery(
    `SELECT conversation_id FROM messages WHERE id = $1 LIMIT 1`,
    [messageId],
  );
  const raw = result.rows[0]?.conversation_id;
  return raw != null ? bigint(raw) : null;
}

export async function interactWithMessage(
  messageId: string,
  memberId: number,
  type: 'pray_click' = 'pray_click',
): Promise<{ interaction_count: number; conversation_id: string; inserted: boolean } | null> {
  const result = await dbQuery(
    `
    WITH ins AS (
      INSERT INTO message_interactions (message_id, member_id, type)
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id, member_id) DO NOTHING
      RETURNING 1
    ),
    upd AS (
      UPDATE messages
      SET interaction_count = interaction_count + (SELECT COUNT(*) FROM ins)
      WHERE id = $1
      RETURNING interaction_count, conversation_id
    )
    SELECT
      COALESCE((SELECT interaction_count FROM upd), m.interaction_count)::int AS interaction_count,
      m.conversation_id,
      (SELECT COUNT(*) FROM ins) = 1 AS inserted
    FROM messages m
    WHERE m.id = $1
    LIMIT 1
    `,
    [messageId, memberId, type],
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    interaction_count: Number(r.interaction_count ?? 0),
    conversation_id: bigint(r.conversation_id),
    inserted: Boolean(r.inserted),
  };
}

// ─── Search members for new chat ──────────────────────────────

export async function searchMembers(
  searchTerm: string,
  excludeMemberId: number,
  limit: number = 20,
) {
  const result = await dbQuery(
    `SELECT m.id, m.name, m.first_name, m.last_name
     FROM members m
     WHERE m.is_active = TRUE
       AND m.id != $1
       AND (
         LOWER(m.name) LIKE '%' || LOWER($2) || '%'
         OR LOWER(COALESCE(m.first_name, '')) LIKE '%' || LOWER($2) || '%'
         OR LOWER(COALESCE(m.last_name, '')) LIKE '%' || LOWER($2) || '%'
       )
     ORDER BY m.name ASC
     LIMIT $3`,
    [excludeMemberId, searchTerm.trim(), limit],
  );
  return result.rows;
}

/**
 * List all registered members (for "new chat" list without search).
 */
export async function listRegisteredMembers(
  excludeMemberId: number,
  limit: number = 50,
) {
  const result = await dbQuery(
    `SELECT m.id, m.name, m.first_name, m.last_name
     FROM members m
     WHERE m.is_active = TRUE
       AND m.id != $1
     ORDER BY m.first_name ASC, m.last_name ASC
     LIMIT $2`,
    [excludeMemberId, limit],
  );
  return result.rows;
}

// ─── Map helper ───────────────────────────────────────────────

function mapMessageWithSender(r: any, currentMemberId: number): MessageWithSender {
  let reactions: MessageWithSender['reactions'] = [];
  if (r.reactions_json) {
    try {
      const parsed = typeof r.reactions_json === 'string'
        ? JSON.parse(r.reactions_json)
        : r.reactions_json;
      if (Array.isArray(parsed)) {
        reactions = parsed;
      }
    } catch { /* ignore */ }
  }

  return {
    id: bigint(r.id),
    conversation_id: bigint(r.conversation_id),
    sender_id: r.sender_id,
    client_msg_id: r.client_msg_id ?? null,
    content: r.content,
    payload_type: normalizePayloadType(r.payload_type),
    payload: normalizePayload(r.payload),
    interaction_count: Number(r.interaction_count ?? 0),
    reply_to_message_id: r.reply_to_message_id ? bigint(r.reply_to_message_id) : null,
    forwarded_from: r.forwarded_from ?? null,
    is_edited: r.is_edited,
    is_deleted: r.is_deleted,
    is_pinned: r.is_pinned ?? false,
    created_at: r.created_at,
    updated_at: r.updated_at,
    sender_name: r.sender_name?.trim() || null,
    sender_first_name: r.sender_first_name || null,
    sender_last_name: r.sender_last_name || null,
    reply_preview: r.rp_id
      ? {
          id: bigint(r.rp_id),
          content: r.rp_content,
          sender_name: r.rp_sender_name?.trim() || null,
          is_deleted: r.rp_is_deleted,
        }
      : null,
    reactions,
  };
}

/**
 * Search messages in a conversation by content.
 */
export async function searchMessages(
  conversationId: string,
  searchQuery: string,
  memberId: number,
  limit: number = 50,
): Promise<MessageWithSender[]> {
  const searchTerm = `%${searchQuery.trim()}%`;

  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      -- reply preview
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      -- reactions aggregated
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $3) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json
    FROM messages msg
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.conversation_id = $1
      AND msg.is_deleted = FALSE
      AND msg.content ILIKE $2
    ORDER BY msg.created_at DESC
    LIMIT $4
    `,
    [conversationId, searchTerm, memberId, limit],
  );

  return result.rows.map((r: any) => mapMessageWithSender(r, memberId));
}
