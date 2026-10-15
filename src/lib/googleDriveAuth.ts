/**
 * Авторизация Google Drive для бекапов.
 * Приоритет credentials (как Firebase):
 * 1. GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH
 * 2. GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
 * 3. GOOGLE_APPLICATION_CREDENTIALS
 * 4. JSON из global_settings.backup_drive_sa_json (админка)
 */
import fs from 'node:fs';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';

import { query } from '../config/db';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
];

export interface DriveServiceAccount {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  [key: string]: unknown;
}

export type DriveClient = drive_v3.Drive;

async function ensureSaColumn(): Promise<void> {
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS backup_drive_sa_json TEXT',
  );
}

function parseSaJson(raw: string): DriveServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as DriveServiceAccount;
    if (
      typeof parsed.client_email === 'string' &&
      parsed.client_email.includes('@') &&
      typeof parsed.private_key === 'string' &&
      parsed.private_key.includes('BEGIN')
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function readSaFromFile(filePath: string): DriveServiceAccount | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return parseSaJson(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function loadDriveServiceAccountFromDb(): Promise<DriveServiceAccount | null> {
  await ensureSaColumn();
  const { rows } = await query(
    'SELECT backup_drive_sa_json FROM global_settings WHERE id = 1',
  );
  const raw = rows[0]?.backup_drive_sa_json;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return parseSaJson(raw);
}

export async function saveDriveServiceAccountJson(
  json: string | null,
): Promise<void> {
  await ensureSaColumn();
  await query(
    `INSERT INTO global_settings (id, start_date, backup_drive_sa_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET backup_drive_sa_json = EXCLUDED.backup_drive_sa_json`,
    [json && json.trim() ? json.trim() : null],
  );
}

/** Загрузка SA: env/file → DB. */
export async function resolveDriveServiceAccount(): Promise<{
  sa: DriveServiceAccount | null;
  source: 'env_path' | 'env_json' | 'adc_path' | 'database' | null;
}> {
  const drivePath = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH?.trim();
  if (drivePath) {
    const sa = readSaFromFile(drivePath);
    if (sa) return { sa, source: 'env_path' };
  }

  const driveJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (driveJson) {
    const sa = parseSaJson(driveJson);
    if (sa) return { sa, source: 'env_json' };
  }

  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (adc) {
    const sa = readSaFromFile(adc);
    if (sa) return { sa, source: 'adc_path' };
  }

  const fromDb = await loadDriveServiceAccountFromDb();
  if (fromDb) return { sa: fromDb, source: 'database' };

  return { sa: null, source: null };
}

export function maskServiceAccountEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const at = email.indexOf('@');
  if (at <= 2) return '***';
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

export async function createDriveClient(): Promise<{
  drive: DriveClient;
  clientEmail: string;
  source: NonNullable<Awaited<ReturnType<typeof resolveDriveServiceAccount>>['source']>;
} | null> {
  const { sa, source } = await resolveDriveServiceAccount();
  if (!sa || !source || !sa.client_email || !sa.private_key) return null;

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: String(sa.private_key).replace(/\\n/g, '\n'),
    scopes: DRIVE_SCOPES,
  });
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });
  return { drive, clientEmail: sa.client_email, source };
}
