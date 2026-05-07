import { query } from '../config/db';

/**
 * Counts unread chat messages for a member using the same rules as chat UI badges.
 *
 * The payload_type filter is critical: system/service records (access requests and internal
 * notifications) are intentionally hidden from the regular chat message list, so including them
 * in the unread SQL would inflate the app badge and create UI inconsistency.
 */
export async function getUnreadMessagesCount(memberId: number): Promise<number> {
  const result = await query(
    `
    SELECT COALESCE(SUM(cnt), 0)::int AS total
    FROM (
      SELECT COUNT(*) AS cnt
      FROM conversation_participants cp
      JOIN messages m ON m.conversation_id = cp.conversation_id
      WHERE cp.member_id = $1
        AND cp.left_at IS NULL
        AND m.id > COALESCE(cp.last_read_message_id, 0)
        AND m.sender_id IS DISTINCT FROM cp.member_id
        AND m.payload_type::text NOT IN ('access_request', 'system', 'notification')
    ) sub
    `,
    [memberId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
