/**
 * Авторизация Google Drive для бекапов.
 * Всё в админке: OAuth Google-аккаунта (личный Gmail) или service account (Shared Drive).
 */
import { randomBytes } from 'node:crypto';

import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';

import { query } from '../config/db';

/** Полный Drive scope: `drive.file` не пишет в уже существующую папку пользователя. */
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];
const DRIVE_OAUTH_SCOPES = [
  ...DRIVE_SCOPES,
  'https://www.googleapis.com/auth/userinfo.email',
];

export function normalizeDrivePrivateKey(key: string): string {
  return key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

export interface DriveServiceAccount {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  [key: string]: unknown;
}

export type DriveAuthSource = 'oauth' | 'database';

export type DriveClient = drive_v3.Drive;

export interface DriveOAuthDocument {
  client_id: string | null;
  client_secret: string | null;
  refresh_token: string | null;
  email: string | null;
  state: string | null;
  state_exp: number | null;
}

async function ensureSaColumn(): Promise<void> {
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS backup_drive_sa_json TEXT',
  );
}

async function ensureOAuthColumn(): Promise<void> {
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS backup_drive_oauth_json TEXT',
  );
}

export function parseDriveServiceAccountJson(raw: string): DriveServiceAccount | null {
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

export function parseDriveOAuthClientJson(raw: string): { client_id: string; client_secret: string } | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const web = parsed.web && typeof parsed.web === 'object' ? (parsed.web as Record<string, unknown>) : null;
    const installed =
      parsed.installed && typeof parsed.installed === 'object'
        ? (parsed.installed as Record<string, unknown>)
        : null;
    const src = web ?? installed ?? parsed;
    const client_id = typeof src.client_id === 'string' ? src.client_id.trim() : '';
    const client_secret = typeof src.client_secret === 'string' ? src.client_secret.trim() : '';
    if (!client_id || !client_secret) return null;
    return { client_id, client_secret };
  } catch {
    return null;
  }
}

function emptyOAuth(): DriveOAuthDocument {
  return {
    client_id: null,
    client_secret: null,
    refresh_token: null,
    email: null,
    state: null,
    state_exp: null,
  };
}

export function normalizeDriveOAuthDocument(raw: unknown): DriveOAuthDocument {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    client_id: typeof o.client_id === 'string' && o.client_id.trim() ? o.client_id.trim() : null,
    client_secret:
      typeof o.client_secret === 'string' && o.client_secret.trim() ? o.client_secret.trim() : null,
    refresh_token:
      typeof o.refresh_token === 'string' && o.refresh_token.trim() ? o.refresh_token.trim() : null,
    email: typeof o.email === 'string' && o.email.includes('@') ? o.email.trim() : null,
    state: typeof o.state === 'string' && o.state.trim() ? o.state.trim() : null,
    state_exp: typeof o.state_exp === 'number' && Number.isFinite(o.state_exp) ? o.state_exp : null,
  };
}

export async function loadDriveServiceAccountFromDb(): Promise<DriveServiceAccount | null> {
  await ensureSaColumn();
  const { rows } = await query(
    'SELECT backup_drive_sa_json FROM global_settings WHERE id = 1',
  );
  const raw = rows[0]?.backup_drive_sa_json;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return parseDriveServiceAccountJson(raw);
}

export async function hasDriveServiceAccountInDb(): Promise<boolean> {
  return (await loadDriveServiceAccountFromDb()) !== null;
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

export async function loadDriveOAuthDocument(): Promise<DriveOAuthDocument> {
  await ensureOAuthColumn();
  const { rows } = await query(
    'SELECT backup_drive_oauth_json FROM global_settings WHERE id = 1',
  );
  const raw = rows[0]?.backup_drive_oauth_json;
  if (typeof raw !== 'string' || !raw.trim()) return emptyOAuth();
  try {
    return normalizeDriveOAuthDocument(JSON.parse(raw) as unknown);
  } catch {
    return emptyOAuth();
  }
}

async function saveDriveOAuthDocument(doc: DriveOAuthDocument): Promise<void> {
  await ensureOAuthColumn();
  const normalized = normalizeDriveOAuthDocument(doc);
  await query(
    `INSERT INTO global_settings (id, start_date, backup_drive_oauth_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET backup_drive_oauth_json = EXCLUDED.backup_drive_oauth_json`,
    [JSON.stringify(normalized)],
  );
}

export async function saveDriveOAuthClientFromAdmin(
  json: string | null,
): Promise<{ ok: boolean; client_id_masked: string | null }> {
  if (json === null || json === '') {
    await saveDriveOAuthDocument(emptyOAuth());
    return { ok: true, client_id_masked: null };
  }
  const parsed = parseDriveOAuthClientJson(json);
  if (!parsed) {
    throw new Error('drive_oauth_invalid_json');
  }
  const current = await loadDriveOAuthDocument();
  const clientChanged = current.client_id !== parsed.client_id;
  await saveDriveOAuthDocument({
    ...current,
    client_id: parsed.client_id,
    client_secret: parsed.client_secret,
    refresh_token: clientChanged ? null : current.refresh_token,
    email: clientChanged ? null : current.email,
    state: null,
    state_exp: null,
  });
  return { ok: true, client_id_masked: maskServiceAccountEmail(parsed.client_id) };
}

export async function disconnectDriveOAuth(): Promise<void> {
  const current = await loadDriveOAuthDocument();
  await saveDriveOAuthDocument({
    ...current,
    refresh_token: null,
    email: null,
    state: null,
    state_exp: null,
  });
}

/** Origin без пробелов/переносов — Google OAuth отклоняет redirect URI с whitespace. */
export function sanitizePublicOrigin(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/\/+$/, '');
}

export function resolveDriveOAuthRedirectUri(req?: {
  protocol?: string;
  headers?: { host?: string; 'x-forwarded-host'?: string | string[]; 'x-forwarded-proto'?: string | string[] };
}): string {
  const env = process.env.PUBLIC_WEB_ORIGIN
    ? sanitizePublicOrigin(process.env.PUBLIC_WEB_ORIGIN)
    : '';
  if (env) return `${env}/api/backup/drive/oauth/callback`;
  const xfHost = req?.headers?.['x-forwarded-host'];
  const hostRaw = (Array.isArray(xfHost) ? xfHost[0] : xfHost) || req?.headers?.host || '';
  const host = hostRaw.replace(/\s+/g, '');
  const xfProto = req?.headers?.['x-forwarded-proto'];
  const proto = ((Array.isArray(xfProto) ? xfProto[0] : xfProto) || req?.protocol || 'https').replace(
    /\s+/g,
    '',
  );
  if (!host) return '/api/backup/drive/oauth/callback';
  return `${proto}://${host}/api/backup/drive/oauth/callback`;
}

export async function beginDriveOAuth(redirectUri: string): Promise<{ auth_url: string; redirect_uri: string }> {
  const doc = await loadDriveOAuthDocument();
  if (!doc.client_id || !doc.client_secret) {
    throw new Error('drive_oauth_client_missing');
  }
  const uri = redirectUri.replace(/\s+/g, '');
  const state = randomBytes(24).toString('hex');
  await saveDriveOAuthDocument({
    ...doc,
    state,
    state_exp: Date.now() + 15 * 60_000,
  });
  const oauth2 = new google.auth.OAuth2(doc.client_id, doc.client_secret, uri);
  const auth_url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: DRIVE_OAUTH_SCOPES,
    state,
  });
  return { auth_url, redirect_uri: uri };
}

export async function finishDriveOAuth(opts: {
  code: string;
  state: string;
  redirectUri: string;
}): Promise<{ email: string | null }> {
  const doc = await loadDriveOAuthDocument();
  if (!doc.client_id || !doc.client_secret) {
    throw new Error('drive_oauth_client_missing');
  }
  if (!doc.state || doc.state !== opts.state || !doc.state_exp || doc.state_exp < Date.now()) {
    throw new Error('drive_oauth_state_invalid');
  }
  const redirectUri = opts.redirectUri.replace(/\s+/g, '');
  const oauth2 = new google.auth.OAuth2(doc.client_id, doc.client_secret, redirectUri);
  const { tokens } = await oauth2.getToken(opts.code);
  if (!tokens.refresh_token) {
    throw new Error('drive_oauth_no_refresh_token');
  }
  oauth2.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 });
    const me = await oauth2api.userinfo.get();
    email = typeof me.data.email === 'string' ? me.data.email : null;
  } catch {
    email = null;
  }
  await saveDriveOAuthDocument({
    ...doc,
    refresh_token: tokens.refresh_token,
    email,
    state: null,
    state_exp: null,
  });
  return { email };
}

/** Только админка / БД — без .env. */
export async function resolveDriveServiceAccount(): Promise<{
  sa: DriveServiceAccount | null;
  source: 'database' | null;
}> {
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
  source: DriveAuthSource;
} | null> {
  const oauth = await loadDriveOAuthDocument();
  if (oauth.refresh_token && oauth.client_id && oauth.client_secret) {
    const auth = new google.auth.OAuth2(oauth.client_id, oauth.client_secret);
    auth.setCredentials({ refresh_token: oauth.refresh_token });
    await auth.getAccessToken();
    const drive = google.drive({ version: 'v3', auth });
    return {
      drive,
      clientEmail: oauth.email || 'oauth-user',
      source: 'oauth',
    };
  }

  const { sa, source } = await resolveDriveServiceAccount();
  if (!sa || !source || !sa.client_email || !sa.private_key) return null;

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: normalizeDrivePrivateKey(String(sa.private_key)),
    scopes: DRIVE_SCOPES,
  });
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });
  return { drive, clientEmail: sa.client_email, source };
}
