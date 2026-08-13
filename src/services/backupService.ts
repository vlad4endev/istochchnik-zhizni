import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { query } from '../config/db';
import { getUploadsRoot } from '../config/uploadsRoot';
import {
  BACKUP_RETENTION_DAYS_MAX,
  loadBackupSettingsDocument,
  updateBackupRunStatus,
  type BackupSettingsAdminView,
  type BackupSettingsDocument,
  type BackupTelegramTarget,
} from './backupSettingsService';
import {
  getTelegramSettings,
  sendTelegramDocumentToChat,
  sendTelegramTextToChat,
} from './telegramService';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TELEGRAM_DOCUMENT_MAX_BYTES = 49 * 1024 * 1024; // запас до лимита Bot API ~50MB

let createInFlight: Promise<BackupCreateResult> | null = null;
let restoreInFlight: Promise<BackupRestoreResult> | null = null;

export const RESTORE_CONFIRM_PHRASE = 'ВОССТАНОВИТЬ';

export interface BackupRestoreResult {
  id: string;
  dry_run: boolean;
  ok: boolean;
  message: string;
  log_tail: string;
  restored: {
    db: boolean;
    uploads: boolean;
    secrets: boolean;
  };
}

export interface BackupRestoreOptions {
  dryRun?: boolean;
  confirm?: string;
  restoreDb?: boolean;
  restoreUploads?: boolean;
  restoreSecrets?: boolean;
  /** Передать passphrase, если бекап зашифрован */
  encryptPassphrase?: string | null;
  skipSafetyBackup?: boolean;
}

export interface BackupListItem {
  id: string;
  created_at: string | null;
  dir_path: string;
  archive_path: string | null;
  size_bytes: number;
  has_archive: boolean;
  has_manifest: boolean;
  age_days: number;
}

export interface BackupCreateResult {
  id: string;
  archive_path: string | null;
  size_bytes: number;
  telegram?: BackupTelegramSendResult;
}

export interface BackupTelegramSendResult {
  ok: boolean;
  sent: number;
  skipped_reason?: string;
  message: string;
  recipients: string[];
}

function backupsRoot(): string {
  const fromEnv = process.env.BACKUP_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(PROJECT_ROOT, fromEnv);
  }
  return path.join(PROJECT_ROOT, 'backups');
}

function stampFromId(id: string): string | null {
  const m = /^istochnik-backup-(\d{8}-\d{6})$/.exec(id);
  return m ? m[1]! : null;
}

function parseStampToDate(stamp: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  const d = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    ),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageDays(created: Date | null): number {
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
}

async function pathSize(p: string): Promise<number> {
  try {
    const st = await fsp.stat(p);
    if (st.isFile()) return st.size;
    if (!st.isDirectory()) return 0;
  } catch {
    return 0;
  }
  let total = 0;
  const entries = await fsp.readdir(p, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(p, e.name);
    if (e.isDirectory()) total += await pathSize(full);
    else if (e.isFile()) {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? PROJECT_ROOT,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer =
      opts.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`timeout_${opts.timeoutMs}`));
          }, opts.timeoutMs)
        : null;
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8');
      if (stdout.length > 500_000) stdout = stdout.slice(-400_000);
    });
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString('utf8');
      if (stderr.length > 500_000) stderr = stderr.slice(-400_000);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function createArchiveFromDir(dirPath: string, archivePath: string): Promise<void> {
  const parent = path.dirname(dirPath);
  const base = path.basename(dirPath);
  const partial = `${archivePath}.partial`;
  await fsp.rm(partial, { force: true }).catch(() => undefined);
  const result = await runCmd('tar', ['-czf', partial, '-C', parent, base], {
    timeoutMs: 30 * 60_000,
  });
  if (result.code !== 0) {
    await fsp.rm(partial, { force: true }).catch(() => undefined);
    throw new Error(`tar_failed:${result.stderr.slice(0, 400)}`);
  }
  await fsp.rename(partial, archivePath);
}

export async function listBackups(): Promise<BackupListItem[]> {
  const root = backupsRoot();
  await fsp.mkdir(root, { recursive: true });
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const ids = new Set<string>();

  for (const e of entries) {
    if (e.isDirectory() && /^istochnik-backup-\d{8}-\d{6}$/.test(e.name)) {
      ids.add(e.name);
    }
    if (e.isFile()) {
      const m = /^(istochnik-backup-\d{8}-\d{6})\.tar\.gz$/.exec(e.name);
      if (m) ids.add(m[1]!);
    }
  }

  const items: BackupListItem[] = [];
  for (const id of ids) {
    const stamp = stampFromId(id);
    const created = stamp ? parseStampToDate(stamp) : null;
    const dirPath = path.join(root, id);
    const archivePath = path.join(root, `${id}.tar.gz`);
    let hasDir = false;
    let hasArchive = false;
    try {
      hasDir = (await fsp.stat(dirPath)).isDirectory();
    } catch {
      hasDir = false;
    }
    try {
      hasArchive = (await fsp.stat(archivePath)).isFile();
    } catch {
      hasArchive = false;
    }
    if (!hasDir && !hasArchive) continue;

    let size = 0;
    if (hasArchive) size = await pathSize(archivePath);
    else if (hasDir) size = await pathSize(dirPath);

    let hasManifest = false;
    if (hasDir) {
      try {
        await fsp.access(path.join(dirPath, 'MANIFEST.txt'));
        hasManifest = true;
      } catch {
        hasManifest = false;
      }
    }

    items.push({
      id,
      created_at: created ? created.toISOString() : null,
      dir_path: hasDir ? dirPath : '',
      archive_path: hasArchive ? archivePath : null,
      size_bytes: size,
      has_archive: hasArchive,
      has_manifest: hasManifest,
      age_days: ageDays(created),
    });
  }

  items.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return items;
}

export async function applyRetention(retentionDays?: number): Promise<{ deleted: string[] }> {
  const settings = await loadBackupSettingsDocument();
  let days = retentionDays ?? settings.retention_days;
  if (days < 1) days = 1;
  if (days > BACKUP_RETENTION_DAYS_MAX) days = BACKUP_RETENTION_DAYS_MAX;

  const items = await listBackups();
  const deleted: string[] = [];
  for (const item of items) {
    if (item.age_days > days) {
      await deleteBackup(item.id);
      deleted.push(item.id);
    }
  }
  return { deleted };
}

export async function deleteBackup(id: string): Promise<void> {
  if (!stampFromId(id)) {
    throw new Error('invalid_backup_id');
  }
  const root = backupsRoot();
  const dirPath = path.join(root, id);
  const archivePath = path.join(root, `${id}.tar.gz`);
  // Не даём выйти за backups/
  if (!dirPath.startsWith(root + path.sep) && dirPath !== root) {
    throw new Error('invalid_backup_path');
  }
  await fsp.rm(dirPath, { recursive: true, force: true });
  await fsp.rm(archivePath, { force: true });
  // latest symlink
  const latest = path.join(root, 'latest');
  try {
    const target = await fsp.readlink(latest);
    if (target === id || target.endsWith(id)) {
      await fsp.rm(latest, { force: true });
    }
  } catch {
    /* ignore */
  }
}

export async function resolveDownloadPath(id: string): Promise<{ filePath: string; fileName: string }> {
  if (!stampFromId(id)) throw new Error('invalid_backup_id');
  const root = backupsRoot();
  const archivePath = path.join(root, `${id}.tar.gz`);
  try {
    const st = await fsp.stat(archivePath);
    if (st.isFile()) {
      return { filePath: archivePath, fileName: `${id}.tar.gz` };
    }
  } catch {
    /* create on the fly from dir */
  }
  const dirPath = path.join(root, id);
  try {
    const st = await fsp.stat(dirPath);
    if (!st.isDirectory()) throw new Error('backup_not_found');
  } catch {
    throw new Error('backup_not_found');
  }
  await createArchiveFromDir(dirPath, archivePath);
  return { filePath: archivePath, fileName: `${id}.tar.gz` };
}

async function getAdminTelegramChatIds(): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT NULLIF(TRIM(COALESCE(telegram_chat_id, '')), '') AS chat_id
     FROM members
     WHERE is_active = TRUE
       AND app_role = 'admin'
       AND COALESCE(telegram_delivery_blocked, FALSE) = FALSE
       AND NULLIF(TRIM(COALESCE(telegram_chat_id, '')), '') IS NOT NULL`,
  );
  return result.rows
    .map((r) => (typeof r.chat_id === 'string' ? r.chat_id.trim() : ''))
    .filter((c) => c.length > 0);
}

async function resolveTelegramRecipients(target: BackupTelegramTarget): Promise<string[]> {
  const ids = new Set<string>();
  if (target === 'admins' || target === 'both') {
    for (const id of await getAdminTelegramChatIds()) ids.add(id);
  }
  if (target === 'default_chat' || target === 'both') {
    const tg = await getTelegramSettings();
    if (tg.default_chat_id?.trim()) ids.add(tg.default_chat_id.trim());
  }
  return [...ids];
}

export async function sendBackupViaTelegram(
  id: string,
  targetOverride?: BackupTelegramTarget,
): Promise<BackupTelegramSendResult> {
  const settings = await loadBackupSettingsDocument();
  const target = targetOverride ?? settings.telegram_target;
  const tg = await getTelegramSettings();
  if (!tg.enabled || !tg.has_bot_token) {
    const message = 'Telegram-бот не настроен или выключен (Админка → Telegram).';
    await updateBackupRunStatus({
      last_telegram_at: new Date().toISOString(),
      last_telegram_status: 'error',
      last_telegram_message: message,
    });
    return { ok: false, sent: 0, skipped_reason: 'bot_not_ready', message, recipients: [] };
  }

  const recipients = await resolveTelegramRecipients(target);
  if (recipients.length === 0) {
    const message =
      target === 'default_chat'
        ? 'Не задан default chat id в настройках Telegram.'
        : 'У администраторов нет telegram_chat_id. Укажите чат в профиле или default chat.';
    await updateBackupRunStatus({
      last_telegram_at: new Date().toISOString(),
      last_telegram_status: 'error',
      last_telegram_message: message,
    });
    return { ok: false, sent: 0, skipped_reason: 'no_recipients', message, recipients: [] };
  }

  const { filePath, fileName } = await resolveDownloadPath(id);
  const size = (await fsp.stat(filePath)).size;
  const caption = `Резервная копия «Источник жизни»\n${id}\nРазмер: ${(size / (1024 * 1024)).toFixed(2)} МБ`;

  let sent = 0;
  const errors: string[] = [];

  if (size > TELEGRAM_DOCUMENT_MAX_BYTES) {
    const text =
      `${caption}\n\nФайл слишком большой для Telegram (>${Math.floor(TELEGRAM_DOCUMENT_MAX_BYTES / (1024 * 1024))} МБ).\n` +
      `Скачайте в Админке → Резервная копия.`;
    for (const chatId of recipients) {
      try {
        const r = await sendTelegramTextToChat(chatId, text);
        if (r.ok) sent += 1;
        else errors.push(`${chatId}: send_failed`);
      } catch (e) {
        errors.push(`${chatId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const message =
      sent > 0
        ? `Уведомление отправлено (${sent}), файл слишком большой для вложения.`
        : `Не удалось уведомить: ${errors.join('; ')}`;
    await updateBackupRunStatus({
      last_telegram_at: new Date().toISOString(),
      last_telegram_status: sent > 0 ? 'ok' : 'error',
      last_telegram_message: message,
    });
    return { ok: sent > 0, sent, message, recipients, skipped_reason: 'file_too_large' };
  }

  for (const chatId of recipients) {
    try {
      const r = await sendTelegramDocumentToChat({
        chatId,
        filePath,
        fileName,
        caption,
      });
      if (r.ok) sent += 1;
      else errors.push(`${chatId}: telegram_rejected`);
    } catch (e) {
      errors.push(`${chatId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const message =
    sent > 0
      ? `Отправлено вложений: ${sent}/${recipients.length}`
      : `Ошибка отправки: ${errors.slice(0, 3).join('; ')}`;
  await updateBackupRunStatus({
    last_telegram_at: new Date().toISOString(),
    last_telegram_status: sent > 0 ? 'ok' : 'error',
    last_telegram_message: message,
  });
  return { ok: sent > 0, sent, message, recipients, skipped_reason: sent > 0 ? undefined : 'send_failed' };
}

async function runBackupScript(retentionDays: number): Promise<{ id: string; dirPath: string }> {
  const root = backupsRoot();
  await fsp.mkdir(root, { recursive: true });
  const script = path.join(PROJECT_ROOT, 'scripts/backup.sh');
  if (!fs.existsSync(script)) {
    throw new Error('backup_script_missing');
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BACKUP_DIR: root,
    BACKUP_KEEP_DAYS: String(Math.min(Math.max(retentionDays, 1), BACKUP_RETENTION_DAYS_MAX)),
    BACKUP_KEEP_COUNT: '62',
  };

  const result = await runCmd('bash', [script, 'create'], {
    cwd: PROJECT_ROOT,
    env,
    timeoutMs: 45 * 60_000,
  });
  if (result.code !== 0) {
    throw new Error(`backup_script_failed:${(result.stderr || result.stdout).slice(-800)}`);
  }

  // Prefer symlink latest
  const latestLink = path.join(root, 'latest');
  let id: string | null = null;
  try {
    id = await fsp.readlink(latestLink);
  } catch {
    id = null;
  }
  if (!id || !stampFromId(id)) {
    const items = await listBackups();
    id = items[0]?.id ?? null;
  }
  if (!id) throw new Error('backup_id_unresolved');
  const dirPath = path.join(root, id);
  return { id, dirPath };
}

export async function createFullBackup(options?: {
  sendTelegram?: boolean;
  trigger?: 'manual' | 'auto' | 'api';
}): Promise<BackupCreateResult> {
  if (createInFlight || restoreInFlight) {
    throw new Error('backup_already_running');
  }

  createInFlight = (async () => {
    const settings = await loadBackupSettingsDocument();
    await updateBackupRunStatus({
      last_run_at: new Date().toISOString(),
      last_run_status: 'running',
      last_run_message: `Создание бекапа (${options?.trigger ?? 'manual'})…`,
      last_run_backup_id: null,
    });

    try {
      // Убедимся, что uploads dir существует (иначе скрипт просто пропустит)
      try {
        await fsp.mkdir(getUploadsRoot(), { recursive: true });
      } catch {
        /* ignore */
      }

      const { id, dirPath } = await runBackupScript(settings.retention_days);
      const archivePath = path.join(backupsRoot(), `${id}.tar.gz`);
      await createArchiveFromDir(dirPath, archivePath);
      const size_bytes = await pathSize(archivePath);

      await applyRetention(settings.retention_days);

      let telegram: BackupTelegramSendResult | undefined;
      const shouldSend =
        typeof options?.sendTelegram === 'boolean' ? options.sendTelegram : settings.telegram_send;
      if (shouldSend) {
        telegram = await sendBackupViaTelegram(id, settings.telegram_target);
      }

      await updateBackupRunStatus({
        last_run_at: new Date().toISOString(),
        last_run_status: 'ok',
        last_run_message: `Готово: ${id} (${(size_bytes / (1024 * 1024)).toFixed(2)} МБ)`,
        last_run_backup_id: id,
      });

      return { id, archive_path: archivePath, size_bytes, telegram };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateBackupRunStatus({
        last_run_at: new Date().toISOString(),
        last_run_status: 'error',
        last_run_message: msg.slice(0, 1000),
        last_run_backup_id: null,
      });
      throw e;
    }
  })();

  try {
    return await createInFlight;
  } finally {
    createInFlight = null;
  }
}

export function isBackupCreateRunning(): boolean {
  return createInFlight !== null;
}

export function isBackupRestoreRunning(): boolean {
  return restoreInFlight !== null;
}

export function isBackupBusy(): boolean {
  return createInFlight !== null || restoreInFlight !== null;
}

/** Гарантирует наличие каталога бекапа (распакует .tar.gz при необходимости). */
export async function ensureBackupDirectory(id: string): Promise<string> {
  if (!stampFromId(id)) throw new Error('invalid_backup_id');
  const root = backupsRoot();
  const dirPath = path.join(root, id);
  try {
    const st = await fsp.stat(dirPath);
    if (st.isDirectory()) {
      await fsp.access(path.join(dirPath, 'MANIFEST.txt'));
      return dirPath;
    }
  } catch {
    /* extract from archive */
  }

  const archivePath = path.join(root, `${id}.tar.gz`);
  try {
    const st = await fsp.stat(archivePath);
    if (!st.isFile()) throw new Error('backup_not_found');
  } catch {
    throw new Error('backup_not_found');
  }

  const stage = path.join(root, `.extract-${id}-${Date.now()}`);
  await fsp.mkdir(stage, { recursive: true });
  try {
    const result = await runCmd('tar', ['-xzf', archivePath, '-C', stage], {
      timeoutMs: 30 * 60_000,
    });
    if (result.code !== 0) {
      throw new Error(`extract_failed:${result.stderr.slice(0, 400)}`);
    }
    // Архив мог содержать istochnik-backup-…/ или плоские файлы
    const nested = path.join(stage, id);
    let source = stage;
    try {
      if ((await fsp.stat(nested)).isDirectory()) source = nested;
    } catch {
      source = stage;
    }
    await fsp.rm(dirPath, { recursive: true, force: true }).catch(() => undefined);
    await fsp.mkdir(path.dirname(dirPath), { recursive: true });
    // Если source === stage и файлы лежат прямо в stage — переименуем stage в dirPath
    if (source === stage) {
      await fsp.rename(stage, dirPath);
    } else {
      await fsp.rename(source, dirPath);
      await fsp.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
    await fsp.access(path.join(dirPath, 'MANIFEST.txt'));
    return dirPath;
  } catch (e) {
    await fsp.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}

async function runRestoreScript(
  dirPath: string,
  options: {
    dryRun: boolean;
    restoreDb: boolean;
    restoreUploads: boolean;
    restoreSecrets: boolean;
    encryptPassphrase?: string | null;
    skipSafetyBackup?: boolean;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const script = path.join(PROJECT_ROOT, 'scripts/restore.sh');
  if (!fs.existsSync(script)) {
    throw new Error('restore_script_missing');
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BACKUP_DIR: backupsRoot(),
    BACKUP_KEEP_DAYS: String(BACKUP_RETENTION_DAYS_MAX),
  };
  if (options.dryRun) {
    delete env.CONFIRM_RESTORE;
  } else {
    env.CONFIRM_RESTORE = 'YES';
  }
  env.RESTORE_DB = options.restoreDb ? '1' : '0';
  env.RESTORE_UPLOADS = options.restoreUploads ? '1' : '0';
  env.RESTORE_SECRETS = options.restoreSecrets ? '1' : '0';
  env.RESTORE_ENV = '0';
  if (options.skipSafetyBackup) env.SKIP_SAFETY_BACKUP = '1';
  if (options.encryptPassphrase) {
    env.BACKUP_ENCRYPT_PASSPHRASE = options.encryptPassphrase;
  }

  return runCmd('bash', [script, dirPath], {
    cwd: PROJECT_ROOT,
    env,
    timeoutMs: 60 * 60_000,
  });
}

export async function restoreFullBackup(
  id: string,
  options: BackupRestoreOptions = {},
): Promise<BackupRestoreResult> {
  if (createInFlight || restoreInFlight) {
    throw new Error('backup_already_running');
  }

  const dryRun = Boolean(options.dryRun);
  const restoreDb = options.restoreDb !== false;
  const restoreUploads = options.restoreUploads !== false;
  const restoreSecrets = Boolean(options.restoreSecrets);

  if (!dryRun) {
    const phrase = typeof options.confirm === 'string' ? options.confirm.trim() : '';
    if (phrase !== RESTORE_CONFIRM_PHRASE) {
      throw new Error('restore_confirm_required');
    }
    if (!restoreDb && !restoreUploads && !restoreSecrets) {
      throw new Error('restore_nothing_selected');
    }
  }

  restoreInFlight = (async () => {
    await updateBackupRunStatus({
      last_run_at: new Date().toISOString(),
      last_run_status: 'running',
      last_run_message: dryRun
        ? `Проверка восстановления из ${id}…`
        : `Восстановление из ${id}…`,
      last_run_backup_id: id,
    });

    try {
      const dirPath = await ensureBackupDirectory(id);
      const result = await runRestoreScript(dirPath, {
        dryRun,
        restoreDb,
        restoreUploads,
        restoreSecrets,
        encryptPassphrase: options.encryptPassphrase,
        skipSafetyBackup: options.skipSafetyBackup,
      });

      const combined = `${result.stdout}\n${result.stderr}`.trim();
      const log_tail = combined.slice(-4000);

      if (result.code !== 0) {
        throw new Error(`restore_script_failed:${log_tail.slice(-800)}`);
      }

      const message = dryRun
        ? `Проверка OK: бекап ${id} целостен и готов к восстановлению.`
        : `Восстановление из ${id} завершено. Перезапустите API/web при необходимости.`;

      await updateBackupRunStatus({
        last_run_at: new Date().toISOString(),
        last_run_status: 'ok',
        last_run_message: message,
        last_run_backup_id: id,
      });

      return {
        id,
        dry_run: dryRun,
        ok: true,
        message,
        log_tail,
        restored: {
          db: !dryRun && restoreDb,
          uploads: !dryRun && restoreUploads,
          secrets: !dryRun && restoreSecrets,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateBackupRunStatus({
        last_run_at: new Date().toISOString(),
        last_run_status: 'error',
        last_run_message: msg.slice(0, 1000),
        last_run_backup_id: id,
      });
      throw e;
    }
  })();

  try {
    return await restoreInFlight;
  } finally {
    restoreInFlight = null;
  }
}

export async function getBackupSettingsAdminView(): Promise<BackupSettingsAdminView> {
  const doc = await loadBackupSettingsDocument();
  const tg = await getTelegramSettings();
  return {
    ...doc,
    backups_dir: backupsRoot(),
    max_retention_days: BACKUP_RETENTION_DAYS_MAX,
    telegram_bot_ready: Boolean(tg.enabled && tg.has_bot_token),
  };
}

export type { BackupSettingsDocument };
