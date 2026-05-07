import { query } from '../config/db';
import { getUnreadEventsCount } from './eventsService';
import { getUnreadMessagesCount } from '../lib/unreadHelpers';

let hasDismissedAtColumnCache: boolean | null = null;

async function hasDismissedAtColumn(): Promise<boolean> {
  if (hasDismissedAtColumnCache != null) {
    return hasDismissedAtColumnCache;
  }
  try {
    const result = await query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'member_notification_deliveries'
          AND column_name = 'dismissed_at'
      ) AS ok
      `,
    );
    hasDismissedAtColumnCache = Boolean(result.rows[0]?.ok);
  } catch {
    hasDismissedAtColumnCache = false;
  }
  return hasDismissedAtColumnCache;
}

export async function getUnreadNotificationDeliveryCount(memberId: number): Promise<number> {
  const hasDismissedAt = await hasDismissedAtColumn();
  const result = await query(
    `
    SELECT COUNT(*)::int AS n
    FROM member_notification_deliveries
    WHERE member_id = $1
      AND opened_at IS NULL
      ${hasDismissedAt ? 'AND dismissed_at IS NULL' : ''}
      AND created_at > NOW() - INTERVAL '90 days'
    `,
    [memberId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Сумма для бейджа приложения: чаты + неоткрытые push/напоминания из журнала. */
export async function getCombinedAppBadgeCount(memberId: number): Promise<number> {
  const [chat, deliveries, unreadEvents] = await Promise.all([
    getUnreadMessagesCount(memberId),
    getUnreadNotificationDeliveryCount(memberId),
    getUnreadEventsCount(memberId),
  ]);
  return Math.min(99, chat + deliveries + unreadEvents);
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
  const hasDismissedAt = await hasDismissedAtColumn();
  const result = await query(
    `
    UPDATE member_notification_deliveries
    SET opened_at = NOW()
    ${hasDismissedAt ? ', dismissed_at = NULL' : ''}
    WHERE id = $1 AND member_id = $2 AND opened_at IS NULL
    `,
    [deliveryId, memberId],
  );
  return Number(result.rowCount ?? 0) > 0;
}

export async function markNotificationDeliveryDismissed(
  deliveryId: number,
  memberId: number,
): Promise<boolean> {
  const hasDismissedAt = await hasDismissedAtColumn();
  if (!hasDismissedAt) {
    // Старые БД без dismissed_at: считаем dismiss неподдерживаемым, но не роняем API.
    return false;
  }
  const result = await query(
    `
    UPDATE member_notification_deliveries
    SET dismissed_at = NOW()
    WHERE id = $1
      AND member_id = $2
      AND opened_at IS NULL
      AND dismissed_at IS NULL
    `,
    [deliveryId, memberId],
  );
  return Number(result.rowCount ?? 0) > 0;
}

export async function markAllNotificationDeliveriesOpened(memberId: number): Promise<number> {
  const hasDismissedAt = await hasDismissedAtColumn();
  const result = await query(
    `
    UPDATE member_notification_deliveries
    SET opened_at = NOW()
    WHERE member_id = $1
      AND opened_at IS NULL
      ${hasDismissedAt ? 'AND dismissed_at IS NULL' : ''}
      AND created_at > NOW() - INTERVAL '90 days'
    `,
    [memberId],
  );
  return Number(result.rowCount ?? 0);
}
