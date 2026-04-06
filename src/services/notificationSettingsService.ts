import { pool } from '../config/db';
import {
  type NotificationSettingsDocument,
  normalizeNotificationSettingsDocument,
} from '../types/notificationSettings';

async function ensureColumn(): Promise<void> {
  if (!pool) return;
  await pool.query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS notification_settings_json TEXT;');
}

export async function loadNotificationSettings(): Promise<NotificationSettingsDocument> {
  if (!pool) {
    return normalizeNotificationSettingsDocument(null);
  }
  await ensureColumn();
  const { rows } = await pool.query('SELECT notification_settings_json FROM global_settings WHERE id = 1');
  const raw = rows[0]?.notification_settings_json;
  if (typeof raw !== 'string' || !raw.trim()) {
    return normalizeNotificationSettingsDocument(null);
  }
  try {
    return normalizeNotificationSettingsDocument(JSON.parse(raw) as unknown);
  } catch {
    return normalizeNotificationSettingsDocument(null);
  }
}

export async function saveNotificationSettings(doc: NotificationSettingsDocument): Promise<void> {
  if (!pool) {
    throw new Error('Database pool is not initialized');
  }
  await ensureColumn();
  const json = JSON.stringify(doc);
  await pool.query(
    `INSERT INTO global_settings (id, start_date, notification_settings_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET notification_settings_json = EXCLUDED.notification_settings_json`,
    [json],
  );
}

/** Сохранить только runtimeState, не трогая правила (для крона). */
export async function patchNotificationRuntimeState(
  mutator: (prev: NotificationSettingsDocument) => NotificationSettingsDocument,
): Promise<NotificationSettingsDocument> {
  const prev = await loadNotificationSettings();
  const next = mutator(prev);
  await saveNotificationSettings(next);
  return next;
}
