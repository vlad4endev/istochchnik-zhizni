import { pool, query } from '../config/db';

/**
 * Сохраняет PushKit VoIP-токен. Токен принадлежит одному участнику/устройству.
 */
export async function saveVoipToken(
  memberId: number,
  deviceId: string,
  voipToken: string,
  platform = 'ios',
): Promise<void> {
  if (!pool) throw new Error('Database is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM device_voip_tokens
       WHERE voip_token = $1 AND NOT (member_id = $2 AND device_id = $3)`,
      [voipToken, memberId, deviceId],
    );
    await client.query(
      `INSERT INTO device_voip_tokens (member_id, device_id, voip_token, platform, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (member_id, device_id)
       DO UPDATE SET voip_token = EXCLUDED.voip_token, platform = EXCLUDED.platform, updated_at = NOW()`,
      [memberId, deviceId, voipToken, platform],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getVoipTokensForMember(memberId: number): Promise<string[]> {
  try {
    const result = await query(
      `SELECT DISTINCT voip_token FROM device_voip_tokens WHERE member_id = $1`,
      [memberId],
    );
    return (result.rows as { voip_token: string }[]).map((r) => r.voip_token).filter(Boolean);
  } catch (e) {
    // Таблица ещё не создана на окружении без миграции
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === '42P01') {
      return [];
    }
    throw e;
  }
}

export async function deleteVoipToken(token: string): Promise<void> {
  await query(`DELETE FROM device_voip_tokens WHERE voip_token = $1`, [token]);
}

export async function deleteVoipTokenForDevice(memberId: number, deviceId: string): Promise<void> {
  await query(`DELETE FROM device_voip_tokens WHERE member_id = $1 AND device_id = $2`, [
    memberId,
    deviceId,
  ]);
}
