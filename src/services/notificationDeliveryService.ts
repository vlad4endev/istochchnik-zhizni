import { query } from '../config/db';

/** Дублирует логику messengerService.getTotalUnreadCount — держите синхронно при изменении SQL. */
async function getChatUnreadTotal(memberId: number): Promise<number> {
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
    ) sub
    `,
    [memberId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function getUnreadNotificationDeliveryCount(memberId: number): Promise<number> {
  const result = await query(
    `
    SELECT COUNT(*)::int AS n
    FROM member_notification_deliveries
    WHERE member_id = $1
      AND opened_at IS NULL
      AND created_at > NOW() - INTERVAL '90 days'
    `,
    [memberId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Сумма для бейджа приложения: чаты + неоткрытые push/напоминания из журнала. */
export async function getCombinedAppBadgeCount(memberId: number): Promise<number> {
  const [chat, deliveries] = await Promise.all([
    getChatUnreadTotal(memberId),
    getUnreadNotificationDeliveryCount(memberId),
  ]);
  return Math.min(99, chat + deliveries);
}

export async function insertMemberNotificationDelivery(input: {
  memberId: number;
  source?: string;
  tag?: string | null;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Promise<number> {
  const result = await query(
    `
    INSERT INTO member_notification_deliveries
      (member_id, source, tag, title, body, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id
    `,
    [
      input.memberId,
      (input.source ?? 'push').slice(0, 32),
      input.tag ?? null,
      input.title.slice(0, 500),
      input.body.slice(0, 2000),
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return Number(result.rows[0]?.id ?? 0);
}

export async function markNotificationDeliveryOpened(
  deliveryId: number,
  memberId: number,
): Promise<boolean> {
  const result = await query(
    `
    UPDATE member_notification_deliveries
    SET opened_at = NOW()
    WHERE id = $1 AND member_id = $2 AND opened_at IS NULL
    `,
    [deliveryId, memberId],
  );
  return Number(result.rowCount ?? 0) > 0;
}
