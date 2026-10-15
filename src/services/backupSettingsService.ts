import { query } from '../config/db';

/** Максимум хранения по требованию продукта — 1 месяц. */
export const BACKUP_RETENTION_DAYS_MAX = 30;
export const BACKUP_RETENTION_DAYS_DEFAULT = 30;

export type BackupTelegramTarget = 'admins' | 'default_chat' | 'both';
export type BackupScheduleKind = 'daily' | 'weekly';

export interface BackupSettingsDocument {
  auto_enabled: boolean;
  /** HH:MM локального timezone */
  schedule_time: string;
  schedule_kind: BackupScheduleKind;
  /** 0=вс … 6=сб — только для weekly */
  schedule_weekdays: number[];
  timezone: string;
  telegram_send: boolean;
  telegram_target: BackupTelegramTarget;
  /** 1…30 */
  retention_days: number;
  /** Выгружать снимки на Google Drive (основное хранилище). */
  drive_enabled: boolean;
  /** ID папки Drive (из URL …/folders/<id>). */
  drive_folder_id: string | null;
  /** После успешной выгрузки удалять локальный архив/каталог. */
  drive_delete_local_after_upload: boolean;
  /** Срок хранения копий на Drive (1…30). */
  drive_retention_days: number;
  last_run_at: string | null;
  last_run_status: 'ok' | 'error' | 'running' | null;
  last_run_message: string | null;
  last_run_backup_id: string | null;
  last_telegram_at: string | null;
  last_telegram_status: 'ok' | 'error' | 'skipped' | null;
  last_telegram_message: string | null;
  last_drive_at: string | null;
  last_drive_status: 'ok' | 'error' | 'skipped' | null;
  last_drive_message: string | null;
  last_drive_file_id: string | null;
}

export type BackupSettingsAdminView = BackupSettingsDocument & {
  backups_dir: string;
  max_retention_days: number;
  telegram_bot_ready: boolean;
  drive_ready: boolean;
  drive_configured: boolean;
  drive_client_email_masked: string | null;
  drive_source: string | null;
  drive_folder_name: string | null;
};

export interface BackupSettingsPatch {
  auto_enabled?: boolean;
  schedule_time?: string;
  schedule_kind?: BackupScheduleKind;
  schedule_weekdays?: number[];
  timezone?: string;
  telegram_send?: boolean;
  telegram_target?: BackupTelegramTarget;
  retention_days?: number;
  drive_enabled?: boolean;
  drive_folder_id?: string | null;
  drive_delete_local_after_upload?: boolean;
  drive_retention_days?: number;
}

async function ensureColumn(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS backup_settings_json TEXT');
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [1]; // понедельник
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
  }
  return out.length > 0 ? out.sort((a, b) => a - b) : [1];
}

function clampRetention(raw: unknown, fallback: number): number {
  let retention =
    typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  if (retention < 1) retention = 1;
  if (retention > BACKUP_RETENTION_DAYS_MAX) retention = BACKUP_RETENTION_DAYS_MAX;
  return retention;
}

function normalizeFolderId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  // Allow pasting full Drive folder URL
  const fromUrl = /\/folders\/([a-zA-Z0-9_-]+)/.exec(t);
  if (fromUrl) return fromUrl[1]!;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;
  return t.slice(0, 200);
}

export function normalizeBackupSettingsDocument(raw: unknown): BackupSettingsDocument {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const time = typeof o.schedule_time === 'string' && isValidTime(o.schedule_time) ? o.schedule_time : '03:30';
  const kind: BackupScheduleKind = o.schedule_kind === 'weekly' ? 'weekly' : 'daily';
  const retention = clampRetention(o.retention_days, BACKUP_RETENTION_DAYS_DEFAULT);
  const driveRetention = clampRetention(
    o.drive_retention_days,
    typeof o.retention_days === 'number' ? retention : BACKUP_RETENTION_DAYS_DEFAULT,
  );

  const targetRaw = o.telegram_target;
  const telegram_target: BackupTelegramTarget =
    targetRaw === 'default_chat' || targetRaw === 'both' || targetRaw === 'admins'
      ? targetRaw
      : 'admins';

  const statusRaw = o.last_run_status;
  const last_run_status =
    statusRaw === 'ok' || statusRaw === 'error' || statusRaw === 'running' ? statusRaw : null;
  const tgStatusRaw = o.last_telegram_status;
  const last_telegram_status =
    tgStatusRaw === 'ok' || tgStatusRaw === 'error' || tgStatusRaw === 'skipped' ? tgStatusRaw : null;
  const driveStatusRaw = o.last_drive_status;
  const last_drive_status =
    driveStatusRaw === 'ok' || driveStatusRaw === 'error' || driveStatusRaw === 'skipped'
      ? driveStatusRaw
      : null;

  // Default: delete local after Drive upload when Drive is enabled (primary off-site store)
  const drive_enabled = Boolean(o.drive_enabled);
  const deleteLocal =
    typeof o.drive_delete_local_after_upload === 'boolean'
      ? o.drive_delete_local_after_upload
      : true;

  return {
    auto_enabled: Boolean(o.auto_enabled),
    schedule_time: time,
    schedule_kind: kind,
    schedule_weekdays: normalizeWeekdays(o.schedule_weekdays),
    timezone:
      typeof o.timezone === 'string' && o.timezone.trim().length > 0
        ? o.timezone.trim()
        : 'Europe/Moscow',
    telegram_send: Boolean(o.telegram_send),
    telegram_target,
    retention_days: retention,
    drive_enabled,
    drive_folder_id: normalizeFolderId(o.drive_folder_id),
    drive_delete_local_after_upload: deleteLocal,
    drive_retention_days: driveRetention,
    last_run_at: typeof o.last_run_at === 'string' ? o.last_run_at : null,
    last_run_status,
    last_run_message: typeof o.last_run_message === 'string' ? o.last_run_message : null,
    last_run_backup_id: typeof o.last_run_backup_id === 'string' ? o.last_run_backup_id : null,
    last_telegram_at: typeof o.last_telegram_at === 'string' ? o.last_telegram_at : null,
    last_telegram_status,
    last_telegram_message: typeof o.last_telegram_message === 'string' ? o.last_telegram_message : null,
    last_drive_at: typeof o.last_drive_at === 'string' ? o.last_drive_at : null,
    last_drive_status,
    last_drive_message: typeof o.last_drive_message === 'string' ? o.last_drive_message : null,
    last_drive_file_id: typeof o.last_drive_file_id === 'string' ? o.last_drive_file_id : null,
  };
}

export async function loadBackupSettingsDocument(): Promise<BackupSettingsDocument> {
  await ensureColumn();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await query('SELECT backup_settings_json FROM global_settings WHERE id = 1');
  const raw = rows[0]?.backup_settings_json;
  if (typeof raw !== 'string' || !raw.trim()) {
    return normalizeBackupSettingsDocument(null);
  }
  try {
    return normalizeBackupSettingsDocument(JSON.parse(raw) as unknown);
  } catch {
    return normalizeBackupSettingsDocument(null);
  }
}

export async function saveBackupSettingsDocument(doc: BackupSettingsDocument): Promise<void> {
  await ensureColumn();
  const normalized = normalizeBackupSettingsDocument(doc);
  await query(
    `INSERT INTO global_settings (id, start_date, backup_settings_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET backup_settings_json = EXCLUDED.backup_settings_json`,
    [JSON.stringify(normalized)],
  );
}

export async function patchBackupSettings(patch: BackupSettingsPatch): Promise<BackupSettingsDocument> {
  const current = await loadBackupSettingsDocument();
  const next: BackupSettingsDocument = { ...current };

  if (typeof patch.auto_enabled === 'boolean') next.auto_enabled = patch.auto_enabled;
  if (typeof patch.schedule_time === 'string') {
    if (!isValidTime(patch.schedule_time)) {
      throw new Error('invalid_schedule_time');
    }
    next.schedule_time = patch.schedule_time;
  }
  if (patch.schedule_kind === 'daily' || patch.schedule_kind === 'weekly') {
    next.schedule_kind = patch.schedule_kind;
  }
  if (patch.schedule_weekdays !== undefined) {
    next.schedule_weekdays = normalizeWeekdays(patch.schedule_weekdays);
  }
  if (typeof patch.timezone === 'string' && patch.timezone.trim()) {
    next.timezone = patch.timezone.trim();
  }
  if (typeof patch.telegram_send === 'boolean') next.telegram_send = patch.telegram_send;
  if (
    patch.telegram_target === 'admins' ||
    patch.telegram_target === 'default_chat' ||
    patch.telegram_target === 'both'
  ) {
    next.telegram_target = patch.telegram_target;
  }
  if (typeof patch.retention_days === 'number' && Number.isFinite(patch.retention_days)) {
    next.retention_days = clampRetention(patch.retention_days, next.retention_days);
  }
  if (typeof patch.drive_enabled === 'boolean') next.drive_enabled = patch.drive_enabled;
  if (patch.drive_folder_id !== undefined) {
    next.drive_folder_id = normalizeFolderId(patch.drive_folder_id);
  }
  if (typeof patch.drive_delete_local_after_upload === 'boolean') {
    next.drive_delete_local_after_upload = patch.drive_delete_local_after_upload;
  }
  if (typeof patch.drive_retention_days === 'number' && Number.isFinite(patch.drive_retention_days)) {
    next.drive_retention_days = clampRetention(patch.drive_retention_days, next.drive_retention_days);
  }

  await saveBackupSettingsDocument(next);
  return next;
}

export async function updateBackupRunStatus(partial: {
  last_run_at?: string | null;
  last_run_status?: BackupSettingsDocument['last_run_status'];
  last_run_message?: string | null;
  last_run_backup_id?: string | null;
  last_telegram_at?: string | null;
  last_telegram_status?: BackupSettingsDocument['last_telegram_status'];
  last_telegram_message?: string | null;
  last_drive_at?: string | null;
  last_drive_status?: BackupSettingsDocument['last_drive_status'];
  last_drive_message?: string | null;
  last_drive_file_id?: string | null;
}): Promise<void> {
  const current = await loadBackupSettingsDocument();
  await saveBackupSettingsDocument({ ...current, ...partial });
}
