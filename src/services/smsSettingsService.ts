import { query } from '../config/db';

export interface SmsSettingsView {
  enabled: boolean;
  api_id_masked: string | null;
  sender_name: string | null;
  has_api_id: boolean;
  has_reset_secret: boolean;
}

export interface SmsSettingsUpdate {
  enabled?: boolean;
  api_id?: string | null;
  sender_name?: string | null;
  reset_secret?: string | null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function maskValue(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length <= 8) return '********';
  return `${raw.slice(0, 4)}...${raw.slice(-3)}`;
}

async function ensureSettingsColumns(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS sms_ru_enabled BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS sms_ru_api_id TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS sms_ru_from TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS password_reset_code_secret TEXT');
}

async function readSettingsRow(): Promise<{
  sms_ru_enabled: boolean;
  sms_ru_api_id: string | null;
  sms_ru_from: string | null;
  password_reset_code_secret: string | null;
}> {
  await ensureSettingsColumns();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const result = await query(
    `SELECT sms_ru_enabled, sms_ru_api_id, sms_ru_from, password_reset_code_secret
     FROM global_settings
     WHERE id = 1`,
  );
  const row = result.rows[0] as
    | {
        sms_ru_enabled?: boolean;
        sms_ru_api_id?: string | null;
        sms_ru_from?: string | null;
        password_reset_code_secret?: string | null;
      }
    | undefined;
  return {
    sms_ru_enabled: Boolean(row?.sms_ru_enabled),
    sms_ru_api_id: normalizeOptionalString(row?.sms_ru_api_id),
    sms_ru_from: normalizeOptionalString(row?.sms_ru_from),
    password_reset_code_secret: normalizeOptionalString(row?.password_reset_code_secret),
  };
}

export async function getSmsSettings(): Promise<SmsSettingsView> {
  const row = await readSettingsRow();
  const envApiId = normalizeOptionalString(process.env.SMS_RU_API_ID);
  const envSecret = normalizeOptionalString(process.env.PASSWORD_RESET_CODE_SECRET);
  const apiId = row.sms_ru_api_id ?? envApiId;
  const secret = row.password_reset_code_secret ?? envSecret;
  return {
    enabled: row.sms_ru_enabled,
    api_id_masked: maskValue(apiId),
    sender_name: row.sms_ru_from,
    has_api_id: Boolean(apiId),
    has_reset_secret: Boolean(secret),
  };
}

export async function updateSmsSettings(input: SmsSettingsUpdate): Promise<SmsSettingsView> {
  await ensureSettingsColumns();
  const current = await readSettingsRow();
  const next = {
    sms_ru_enabled: typeof input.enabled === 'boolean' ? input.enabled : current.sms_ru_enabled,
    sms_ru_api_id:
      input.api_id !== undefined ? normalizeOptionalString(input.api_id) : current.sms_ru_api_id,
    sms_ru_from:
      input.sender_name !== undefined ? normalizeOptionalString(input.sender_name) : current.sms_ru_from,
    password_reset_code_secret:
      input.reset_secret !== undefined
        ? normalizeOptionalString(input.reset_secret)
        : current.password_reset_code_secret,
  };

  await query(
    `INSERT INTO global_settings (
      id, start_date, sms_ru_enabled, sms_ru_api_id, sms_ru_from, password_reset_code_secret
    )
    VALUES (1, CURRENT_DATE, $1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET
      sms_ru_enabled = EXCLUDED.sms_ru_enabled,
      sms_ru_api_id = EXCLUDED.sms_ru_api_id,
      sms_ru_from = EXCLUDED.sms_ru_from,
      password_reset_code_secret = EXCLUDED.password_reset_code_secret`,
    [next.sms_ru_enabled, next.sms_ru_api_id, next.sms_ru_from, next.password_reset_code_secret],
  );
  return getSmsSettings();
}

export async function resolveSmsRuntimeConfig(): Promise<{
  enabled: boolean;
  apiId: string | null;
  senderName: string | null;
  resetSecret: string | null;
}> {
  const row = await readSettingsRow();
  return {
    enabled: row.sms_ru_enabled,
    apiId: row.sms_ru_api_id ?? normalizeOptionalString(process.env.SMS_RU_API_ID),
    senderName: row.sms_ru_from ?? normalizeOptionalString(process.env.SMS_RU_FROM),
    resetSecret:
      row.password_reset_code_secret ?? normalizeOptionalString(process.env.PASSWORD_RESET_CODE_SECRET),
  };
}
