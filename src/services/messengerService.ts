import { query } from '../config/db';
import type {
  ConversationListItem,
  ConversationType,
  MessageWithSender,
  ParticipantRole,
} from '../types/messenger';

// ─── Helpers ──────────────────────────────────────────────────

function bigint(v: unknown): string {
  return String(v);
}

// ─── Conversations ────────────────────────────────────────────

/**
 * List conversations the member participates in, sorted by last activity.
 * Includes last message preview and unread count.
 */
export async function listConversations(memberId: number): Promise<ConversationListItem[]> {
  const result = await query(
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
      -- other member for personal chats
      om.id          AS om_id,
      om.name        AS om_name,
      om.first_name  AS om_first_name,
      om.last_name   AS om_last_name
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
    -- other member for personal chats
    LEFT JOIN LATERAL (
      SELECT om2.id, om2.name, om2.first_name, om2.last_name
      FROM conversation_participants op
      JOIN members om2 ON om2.id = op.member_id
      WHERE op.conversation_id = c.id
        AND op.member_id != $1
        AND op.left_at IS NULL
        AND c.type = 'personal'
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
        }
      : null,
  }));
}

/**
 * Find or create a personal (P2P) conversation between two members.
 */
export async function findOrCreatePersonalConversation(
  memberA: number,
  memberB: number,
): Promise<string> {
  if (memberA === memberB) throw new Error('Cannot create chat with yourself');

  // Check if personal conversation already exists
  const existing = await query(
    `
    SELECT cp1.conversation_id
    FROM conversation_participants cp1
    JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
    JOIN conversations c ON c.id = cp1.conversation_id
    WHERE cp1.member_id = $1
      AND cp2.member_id = $2
      AND cp1.left_at IS NULL
      AND cp2.left_at IS NULL
      AND c.type = 'personal'
    LIMIT 1
    `,
    [memberA, memberB],
  );

  if (existing.rows[0]) {
    return bigint(existing.rows[0].conversation_id);
  }

  // Create new
  const conv = await query(
    `INSERT INTO conversations (type) VALUES ('personal') RETURNING id`,
  );
  const convId = bigint(conv.rows[0].id);

  await query(
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
  const conv = await query(
    `INSERT INTO conversations (type, title) VALUES ($1, $2) RETURNING id`,
    [type, title.trim()],
  );
  const convId = bigint(conv.rows[0].id);

  // Creator is owner
  await query(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, 'owner')`,
    [convId, creatorId],
  );

  // Add members
  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== creatorId))];
  for (const mId of uniqueMembers) {
    await query(
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
  const result = await query(
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
  const result = await query(
    `SELECT role FROM conversation_participants
     WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [conversationId, memberId],
  );
  return (result.rows[0]?.role as ParticipantRole) ?? null;
}

/**
 * Get conversation type.
 */
export async function getConversationType(
  conversationId: string,
): Promise<ConversationType | null> {
  const result = await query(
    `SELECT type FROM conversations WHERE id = $1 LIMIT 1`,
    [conversationId],
  );
  return (result.rows[0]?.type as ConversationType) ?? null;
}

/**
 * Get active participant member IDs for a conversation.
 */
export async function getConversationMemberIds(conversationId: string): Promise<number[]> {
  const result = await query(
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
  const result = await query(
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
  await query(
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
  await query(
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
  await query(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = $${i}`,
    params,
  );
}

// ─── Messages ─────────────────────────────────────────────────

/**
 * Send a message. Returns the full message with sender info.
 */
export async function sendMessage(
  conversationId: string,
  senderId: number,
  content: string,
  replyToMessageId?: string | null,
): Promise<MessageWithSender> {
  const result = await query(
    `
    WITH inserted AS (
      INSERT INTO messages (conversation_id, sender_id, content, reply_to_message_id)
      VALUES ($1, $2, $3, $4)
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
    [conversationId, senderId, content.trim(), replyToMessageId || null],
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

  const result = await query(
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
  const result = await query(
    `UPDATE messages SET content = $1
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
  const result = await query(
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
  await query(
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
  const result = await query(
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
  const result = await query(
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
  const result = await query(
    `DELETE FROM message_reactions
     WHERE message_id = $1 AND member_id = $2 AND emoji = $3
     RETURNING message_id`,
    [messageId, memberId, emoji],
  );
  return result.rows.length > 0;
}

// ─── Search members for new chat ──────────────────────────────

export async function searchMembers(
  searchTerm: string,
  excludeMemberId: number,
  limit: number = 20,
) {
  const result = await query(
    `SELECT DISTINCT m.id, m.name, m.first_name, m.last_name
     FROM members m
     INNER JOIN auth_sessions s ON s.member_id = m.id
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
  const result = await query(
    `SELECT DISTINCT m.id, m.name, m.first_name, m.last_name
     FROM members m
     INNER JOIN auth_sessions s ON s.member_id = m.id
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
    content: r.content,
    reply_to_message_id: r.reply_to_message_id ? bigint(r.reply_to_message_id) : null,
    is_edited: r.is_edited,
    is_deleted: r.is_deleted,
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

  const result = await query(
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
