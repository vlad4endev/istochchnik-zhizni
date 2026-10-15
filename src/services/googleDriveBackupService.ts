/**
 * Выгрузка резервных копий в Google Drive (основное off-site хранилище).
 *
 * Service Account → папка на Drive (шаринг на client_email).
 * Resumable upload через googleapis; retention и список на стороне Drive.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  createDriveClient,
  maskServiceAccountEmail,
  resolveDriveServiceAccount,
  saveDriveServiceAccountJson,
  type DriveClient,
} from '../lib/googleDriveAuth';
import {
  BACKUP_RETENTION_DAYS_MAX,
  loadBackupSettingsDocument,
  updateBackupRunStatus,
} from './backupSettingsService';

const BACKUP_NAME_RE = /^istochnik-backup-\d{8}-\d{6}\.tar\.gz$/;
const META_SUFFIX = '.meta.json';

export interface DriveRemoteBackup {
  id: string;
  drive_file_id: string;
  name: string;
  size_bytes: number;
  created_at: string | null;
  web_view_link: string | null;
  has_meta: boolean;
}

export interface DriveUploadResult {
  ok: boolean;
  backup_id: string;
  drive_file_id: string | null;
  web_view_link: string | null;
  size_bytes: number;
  message: string;
  deleted_local: boolean;
}

export interface DriveStatusView {
  configured: boolean;
  ready: boolean;
  source: string | null;
  client_email_masked: string | null;
  folder_id: string | null;
  folder_ok: boolean | null;
  folder_name: string | null;
  message: string;
}

function stampFromBackupId(id: string): string | null {
  const m = /^istochnik-backup-(\d{8}-\d{6})$/.exec(id);
  return m ? m[1]! : null;
}

function backupIdFromFileName(name: string): string | null {
  const m = /^(istochnik-backup-\d{8}-\d{6})\.tar\.gz$/.exec(name);
  return m ? m[1]! : null;
}

function parseStampToIso(stamp: string): string | null {
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
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function getDriveOrThrow(): Promise<{ drive: DriveClient; clientEmail: string }> {
  const client = await createDriveClient();
  if (!client) {
    throw new Error('drive_not_configured');
  }
  return client;
}

export async function getDriveStatus(folderId?: string | null): Promise<DriveStatusView> {
  const settings = await loadBackupSettingsDocument();
  const folder = (folderId ?? settings.drive_folder_id)?.trim() || null;
  const { sa, source } = await resolveDriveServiceAccount();

  if (!sa) {
    return {
      configured: false,
      ready: false,
      source: null,
      client_email_masked: null,
      folder_id: folder,
      folder_ok: null,
      folder_name: null,
      message:
        'Нет service account. Укажите GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON / PATH или вставьте JSON в админке.',
    };
  }

  const emailMasked = maskServiceAccountEmail(sa.client_email ?? null);
  if (!folder) {
    return {
      configured: true,
      ready: false,
      source,
      client_email_masked: emailMasked,
      folder_id: null,
      folder_ok: null,
      folder_name: null,
      message:
        'Укажите ID папки Google Drive и расшарьте её на service account (редактор).',
    };
  }

  try {
    const client = await createDriveClient();
    if (!client) {
      return {
        configured: true,
        ready: false,
        source,
        client_email_masked: emailMasked,
        folder_id: folder,
        folder_ok: false,
        folder_name: null,
        message: 'Не удалось авторизоваться в Google (проверьте JSON ключ).',
      };
    }
    const folderMeta = await client.drive.files.get({
      fileId: folder,
      fields: 'id, name, mimeType, trashed',
      supportsAllDrives: true,
    });
    const data = folderMeta.data as {
      mimeType?: string | null;
      name?: string | null;
      trashed?: boolean | null;
    };
    const mime = data.mimeType;
    const name = data.name ?? null;
    if (data.trashed) {
      return {
        configured: true,
        ready: false,
        source,
        client_email_masked: emailMasked,
        folder_id: folder,
        folder_ok: false,
        folder_name: name,
        message: 'Папка в корзине Drive.',
      };
    }
    if (mime !== 'application/vnd.google-apps.folder') {
      return {
        configured: true,
        ready: false,
        source,
        client_email_masked: emailMasked,
        folder_id: folder,
        folder_ok: false,
        folder_name: name,
        message: 'Указанный ID не является папкой.',
      };
    }
    return {
      configured: true,
      ready: true,
      source,
      client_email_masked: emailMasked,
      folder_id: folder,
      folder_ok: true,
      folder_name: name,
      message: `Готово: папка «${name}», SA ${emailMasked}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      configured: true,
      ready: false,
      source,
      client_email_masked: emailMasked,
      folder_id: folder,
      folder_ok: false,
      folder_name: null,
      message: `Нет доступа к папке: ${msg.slice(0, 300)}. Расшарьте папку на ${emailMasked ?? 'service account'}.`,
    };
  }
}

async function findExistingBackupFile(
  drive: DriveClient,
  folderId: string,
  fileName: string,
): Promise<string | null> {
  const q = [
    `'${folderId}' in parents`,
    `name = '${fileName.replace(/'/g, "\\'")}'`,
    'trashed = false',
  ].join(' and ');
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  const id = res.data.files?.[0]?.id;
  return id ?? null;
}

export async function uploadBackupArchiveToDrive(opts: {
  backupId: string;
  archivePath: string;
  metaPath?: string | null;
  folderId?: string | null;
  deleteLocalAfter?: boolean;
}): Promise<DriveUploadResult> {
  const settings = await loadBackupSettingsDocument();
  const folderId = (opts.folderId ?? settings.drive_folder_id)?.trim();
  if (!folderId) {
    throw new Error('drive_folder_missing');
  }

  const stamp = stampFromBackupId(opts.backupId);
  if (!stamp) throw new Error('invalid_backup_id');

  const st = await fsp.stat(opts.archivePath);
  if (!st.isFile() || st.size <= 0) {
    throw new Error('backup_archive_missing');
  }

  const { drive } = await getDriveOrThrow();
  const fileName = `${opts.backupId}.tar.gz`;

  const existingId = await findExistingBackupFile(drive, folderId, fileName);
  if (existingId) {
    await drive.files.delete({ fileId: existingId, supportsAllDrives: true }).catch(() => undefined);
  }

  const mediaBody = fs.createReadStream(opts.archivePath);
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      description: `Источник жизни backup ${opts.backupId}`,
      appProperties: {
        istochnik_backup_id: opts.backupId,
        istochnik_stamp: stamp,
        istochnik_kind: 'archive',
      },
    },
    media: {
      mimeType: 'application/gzip',
      body: mediaBody,
    },
    fields: 'id, name, size, webViewLink, createdTime',
    supportsAllDrives: true,
  });

  const driveFileId = created.data.id ?? null;
  const webViewLink = created.data.webViewLink ?? null;
  const sizeBytes = Number(created.data.size ?? st.size);

  // Companion meta (инвентарь/компоненты) — маленький JSON рядом
  if (opts.metaPath && fs.existsSync(opts.metaPath) && driveFileId) {
    try {
      const metaName = `${opts.backupId}${META_SUFFIX}`;
      const oldMeta = await findExistingBackupFile(drive, folderId, metaName);
      if (oldMeta) {
        await drive.files.delete({ fileId: oldMeta, supportsAllDrives: true }).catch(() => undefined);
      }
      await drive.files.create({
        requestBody: {
          name: metaName,
          parents: [folderId],
          appProperties: {
            istochnik_backup_id: opts.backupId,
            istochnik_kind: 'meta',
          },
        },
        media: {
          mimeType: 'application/json',
          body: fs.createReadStream(opts.metaPath),
        },
        fields: 'id',
        supportsAllDrives: true,
      });
    } catch (e) {
      console.warn('[drive-backup] meta upload failed:', e);
    }
  }

  const message = `Загружено на Google Drive (${(sizeBytes / (1024 * 1024)).toFixed(2)} МБ).`;

  await updateBackupRunStatus({
    last_drive_at: new Date().toISOString(),
    last_drive_status: 'ok',
    last_drive_message: message,
    last_drive_file_id: driveFileId,
  });

  return {
    ok: true,
    backup_id: opts.backupId,
    drive_file_id: driveFileId,
    web_view_link: webViewLink,
    size_bytes: sizeBytes,
    message,
    deleted_local: false,
  };
}

export async function listDriveBackups(folderId?: string | null): Promise<DriveRemoteBackup[]> {
  const settings = await loadBackupSettingsDocument();
  const folder = (folderId ?? settings.drive_folder_id)?.trim();
  if (!folder) return [];

  const { drive } = await getDriveOrThrow();

  const items: DriveRemoteBackup[] = [];
  const metaIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folder}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, size, createdTime, webViewLink, appProperties)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      orderBy: 'createdTime desc',
    });
    for (const f of res.data.files ?? []) {
      const row = f as {
        id?: string | null;
        name?: string | null;
        size?: string | null;
        createdTime?: string | null;
        webViewLink?: string | null;
      };
      const name = row.name ?? '';
      if (name.endsWith(META_SUFFIX)) {
        const id = name.slice(0, -META_SUFFIX.length);
        if (stampFromBackupId(id)) metaIds.add(id);
        continue;
      }
      if (!BACKUP_NAME_RE.test(name)) continue;
      const backupId = backupIdFromFileName(name);
      if (!backupId || !row.id) continue;
      const stamp = stampFromBackupId(backupId);
      items.push({
        id: backupId,
        drive_file_id: row.id,
        name,
        size_bytes: Number(row.size ?? 0),
        created_at: row.createdTime ?? (stamp ? parseStampToIso(stamp) : null),
        web_view_link: row.webViewLink ?? null,
        has_meta: false,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  for (const item of items) {
    item.has_meta = metaIds.has(item.id);
  }

  items.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return items;
}

export async function applyDriveRetention(retentionDays?: number): Promise<{ deleted: string[] }> {
  const settings = await loadBackupSettingsDocument();
  let days = retentionDays ?? settings.drive_retention_days ?? settings.retention_days;
  if (days < 1) days = 1;
  if (days > BACKUP_RETENTION_DAYS_MAX) days = BACKUP_RETENTION_DAYS_MAX;

  const folder = settings.drive_folder_id?.trim();
  if (!folder || !settings.drive_enabled) return { deleted: [] };

  const client = await createDriveClient();
  if (!client) return { deleted: [] };

  const { drive } = client;
  const remotes = await listDriveBackups(folder);
  const deleted: string[] = [];
  const cutoff = Date.now() - days * 86400000;

  for (const item of remotes) {
    const created = item.created_at ? Date.parse(item.created_at) : NaN;
    const stamp = stampFromBackupId(item.id);
    const stampIso = stamp ? parseStampToIso(stamp) : null;
    const ts = Number.isFinite(created) ? created : stampIso ? Date.parse(stampIso) : NaN;
    if (!Number.isFinite(ts) || ts >= cutoff) continue;

    try {
      await drive.files.delete({ fileId: item.drive_file_id, supportsAllDrives: true });
      // meta
      const metaName = `${item.id}${META_SUFFIX}`;
      const metaId = await findExistingBackupFile(drive, folder, metaName);
      if (metaId) {
        await drive.files.delete({ fileId: metaId, supportsAllDrives: true }).catch(() => undefined);
      }
      deleted.push(item.id);
    } catch (e) {
      console.warn('[drive-backup] retention delete failed', item.id, e);
    }
  }
  return { deleted };
}

export async function deleteDriveBackup(backupId: string): Promise<void> {
  if (!stampFromBackupId(backupId)) throw new Error('invalid_backup_id');
  const settings = await loadBackupSettingsDocument();
  const folder = settings.drive_folder_id?.trim();
  if (!folder) throw new Error('drive_folder_missing');

  const { drive } = await getDriveOrThrow();
  const archiveName = `${backupId}.tar.gz`;
  const archiveId = await findExistingBackupFile(drive, folder, archiveName);
  if (archiveId) {
    await drive.files.delete({ fileId: archiveId, supportsAllDrives: true });
  }
  const metaId = await findExistingBackupFile(drive, folder, `${backupId}${META_SUFFIX}`);
  if (metaId) {
    await drive.files.delete({ fileId: metaId, supportsAllDrives: true });
  }
}

/** Скачать архив с Drive во временный файл; caller удаляет. */
export async function downloadDriveBackupToFile(
  backupId: string,
  destPath: string,
): Promise<{ size_bytes: number; drive_file_id: string }> {
  if (!stampFromBackupId(backupId)) throw new Error('invalid_backup_id');
  const settings = await loadBackupSettingsDocument();
  const folder = settings.drive_folder_id?.trim();
  if (!folder) throw new Error('drive_folder_missing');

  const { drive } = await getDriveOrThrow();
  const fileId = await findExistingBackupFile(drive, folder, `${backupId}.tar.gz`);
  if (!fileId) throw new Error('drive_backup_not_found');

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  const stream = res.data as Readable;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    stream.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    stream.on('error', reject);
  });
  const size = (await fsp.stat(destPath)).size;
  return { size_bytes: size, drive_file_id: fileId };
}

export async function setDriveServiceAccountFromAdmin(
  json: string | null,
): Promise<{ ok: boolean; client_email_masked: string | null }> {
  if (json === null || json === '') {
    await saveDriveServiceAccountJson(null);
    return { ok: true, client_email_masked: null };
  }
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
  } catch {
    throw new Error('drive_sa_invalid_json');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('drive_sa_missing_fields');
  }
  await saveDriveServiceAccountJson(json);
  return { ok: true, client_email_masked: maskServiceAccountEmail(parsed.client_email) };
}

export async function buildDriveMetaSidecar(dirPath: string, destPath: string): Promise<void> {
  const componentsPath = path.join(dirPath, 'components.json');
  const inventoryPath = path.join(dirPath, 'inventory.json');
  const manifestPath = path.join(dirPath, 'MANIFEST.txt');
  const payload: Record<string, unknown> = {
    version: 1,
    created_at: new Date().toISOString(),
  };
  try {
    payload.components = JSON.parse(await fsp.readFile(componentsPath, 'utf8'));
  } catch {
    /* optional */
  }
  try {
    payload.inventory = JSON.parse(await fsp.readFile(inventoryPath, 'utf8'));
  } catch {
    /* optional */
  }
  try {
    payload.manifest_text = await fsp.readFile(manifestPath, 'utf8');
  } catch {
    /* optional */
  }
  await fsp.writeFile(destPath, JSON.stringify(payload), 'utf8');
}
