import { pool, query } from '../config/db';

const BAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Сохраняет FCM-токен устройства. Токен принадлежит ровно одному участнику:
 * при смене аккаунта на том же устройстве (или переустановке приложения) старые
 * привязки этого токена и прежние токены этого device_id удаляются, иначе прошлый
 * владелец продолжал бы получать чужие уведомления, а дубли давали двойные пуши.
 */
export async function saveFcmToken(memberId: number, deviceId: string, fcmToken: string): Promise<void> {
  if (!pool) throw new Error('Database is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM user_subscriptions
       WHERE fcm_token = $1 AND NOT (member_id = $2 AND device_id = $3)`,
      [fcmToken, memberId, deviceId],
    );
    await client.query(
      `INSERT INTO user_subscriptions (member_id, device_id, fcm_token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (member_id, device_id)
       DO UPDATE SET fcm_token = EXCLUDED.fcm_token, updated_at = NOW()`,
      [memberId, deviceId, fcmToken],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getFcmTokensForMember(memberId: number): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT fcm_token FROM user_subscriptions WHERE member_id = $1`,
    [memberId],
  );
  return (result.rows as { fcm_token: string }[]).map((r) => r.fcm_token).filter(Boolean);
}

export async function deleteFcmToken(token: string): Promise<void> {
  await query(`DELETE FROM user_subscriptions WHERE fcm_token = $1`, [token]);
}

/** Выход из аккаунта на устройстве: прекращаем слать пуши этому участнику на это устройство. */
export async function deleteFcmTokenForDevice(memberId: number, deviceId: string): Promise<void> {
  await query(`DELETE FROM user_subscriptions WHERE member_id = $1 AND device_id = $2`, [
    memberId,
    deviceId,
  ]);
}

export function isUnrecoverableFcmErrorCode(code: string | undefined): boolean {
  if (!code) return false;
  return BAD_TOKEN_CODES.has(code);
}

/**
 * Участники с хотя бы одной Web Push или FCM подпиской (для рассылок).
 */
export async function getMemberIdsWithAnyPushSubscription(): Promise<number[]> {
  const result = await query(
    `SELECT DISTINCT member_id FROM push_subscriptions
     UNION
     SELECT DISTINCT member_id FROM user_subscriptions`,
  );
  return (result.rows as { member_id: number }[]).map((r) => Number(r.member_id)).filter((n) => Number.isFinite(n));
}

/**
 * Координаторы сбора с активной подпиской на пуш (Web или FCM).
 */
export async function getCoordinatorMemberIdsWithPush(): Promise<number[]> {
  const result = await query(
    `SELECT m.id
     FROM members m
     WHERE m.is_collection_coordinator = TRUE
       AND m.is_active = TRUE
       AND (
         EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.member_id = m.id)
         OR EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.member_id = m.id)
       )`,
  );
  return (result.rows as { id: number }[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
}

/**
 * Администраторы с активной подпиской на пуш (Web или FCM).
 */
export async function getAdminMemberIdsWithPush(): Promise<number[]> {
  const result = await query(
    `SELECT m.id
     FROM members m
     WHERE m.is_active = TRUE
       AND LOWER(COALESCE(m.app_role, '')) = 'admin'
       AND (
         EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.member_id = m.id)
         OR EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.member_id = m.id)
       )`,
  );
  return (result.rows as { id: number }[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
}
