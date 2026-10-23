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

import { formatDriveApiError } from '../lib/googleDriveErrors';
import {
  createDriveClient,
  loadDriveOAuthDocument,
  maskServiceAccountEmail,
  parseDriveServiceAccountJson,
  resolveDriveServiceAccount,
  saveDriveServiceAccountJson,
  type DriveClient,
} from '../lib/googleDriveAuth';
import {
  BACKUP_RETENTION_DAYS_MAX,
  loadBackupSettingsDocument,
  updateBackupRunStatus,
} from './backupSettingsService';

/** Крупные .tar.gz бекапа: axios по умолчанию режет тело ~10 МБ. */
const DRIVE_HTTP_OPTS = {
  maxBodyLength: Infinity as number,
  maxContentLength: Infinity as number,
  timeout: 60 * 60 * 1000,
};

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
  oauth_connected: boolean;
  oauth_client_saved: boolean;
  folder_kind: 'my_drive' | 'shared_drive' | null;
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

function statusView(
  partial: Partial<DriveStatusView> & Pick<DriveStatusView, 'configured' | 'ready' | 'message'>,
): DriveStatusView {
  return {
    source: null,
    client_email_masked: null,
    folder_id: null,
    folder_ok: null,
    folder_name: null,
    oauth_connected: false,
    oauth_client_saved: false,
    folder_kind: null,
    ...partial,
  };
}

async function probeFolderWrite(drive: DriveClient, folderId: string): Promise<{ ok: boolean; error?: string }> {
  const probeName = `.istochnik-write-probe-${Date.now()}`;
  try {
    const created = await drive.files.create({
      requestBody: {
        name: probeName,
        parents: [folderId],
        mimeType: 'text/plain',
      },
      media: {
        mimeType: 'text/plain',
        body: 'ok',
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const id = created.data.id;
    if (id) {
      await drive.files.delete({ fileId: id, supportsAllDrives: true }).catch(() => undefined);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatDriveApiError(e) };
  }
}

export async function resolveDriveFolderId(
  drive: DriveClient,
  folderId: string,
): Promise<{ id: string; name: string | null; mimeType: string | null; driveId: string | null; trashed: boolean }> {
  const folderMeta = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, trashed, driveId, shortcutDetails, capabilities(canAddChildren, canEdit)',
    supportsAllDrives: true,
  });
  const data = folderMeta.data as {
    id?: string | null;
    mimeType?: string | null;
    name?: string | null;
    trashed?: boolean | null;
    driveId?: string | null;
    shortcutDetails?: { targetId?: string | null } | null;
  };
  if (data.mimeType === 'application/vnd.google-apps.shortcut' && data.shortcutDetails?.targetId) {
    return resolveDriveFolderId(drive, data.shortcutDetails.targetId);
  }
  return {
    id: data.id || folderId,
    name: data.name ?? null,
    mimeType: data.mimeType ?? null,
    driveId: data.driveId ?? null,
    trashed: Boolean(data.trashed),
  };
}

export async function getDriveStatus(folderId?: string | null): Promise<DriveStatusView> {
  const settings = await loadBackupSettingsDocument();
  const folder = (folderId ?? settings.drive_folder_id)?.trim() || null;
  const { sa, source: saSource } = await resolveDriveServiceAccount();
  const oauth = await loadDriveOAuthDocument();
  const oauthConnected = Boolean(oauth.refresh_token);
  const oauthClientSaved = Boolean(oauth.client_id && oauth.client_secret);
  const emailMasked = oauthConnected
    ? maskServiceAccountEmail(oauth.email)
    : maskServiceAccountEmail(sa?.client_email ?? null);
  const authSource = oauthConnected ? 'oauth' : saSource;

  const base = {
    oauth_connected: oauthConnected,
    oauth_client_saved: oauthClientSaved,
    client_email_masked: emailMasked,
    folder_id: folder,
    source: authSource,
  };

  if (!sa && !oauthConnected && !oauthClientSaved) {
    return statusView({
      ...base,
      configured: false,
      ready: false,
      source: null,
      client_email_masked: null,
      message:
        'Подключите Google-аккаунт («Войти через Google») или вставьте JSON service account для общего диска Workspace.',
    });
  }

  if (!oauthConnected && oauthClientSaved && !sa) {
    return statusView({
      ...base,
      configured: true,
      ready: false,
      message: 'OAuth-клиент сохранён. Нажмите «Войти через Google», чтобы дать доступ к вашей папке.',
    });
  }

  if (!folder) {
    return statusView({
      ...base,
      configured: true,
      ready: false,
      folder_id: null,
      message: 'Укажите ID папки Google Drive ниже.',
    });
  }

  try {
    const client = await createDriveClient();
    if (!client) {
      return statusView({
        ...base,
        configured: true,
        ready: false,
        folder_ok: false,
        message: oauthClientSaved
          ? 'Нажмите «Войти через Google» (токен ещё не получен).'
          : 'Не удалось авторизоваться в Google (проверьте JSON ключ).',
      });
    }
    const resolved = await resolveDriveFolderId(client.drive, folder);
    const name = resolved.name;
    const folderKind = resolved.driveId ? 'shared_drive' : 'my_drive';
    if (resolved.trashed) {
      return statusView({
        ...base,
        configured: true,
        ready: false,
        folder_ok: false,
        folder_name: name,
        folder_kind: folderKind,
        message: 'Папка в корзине Drive.',
      });
    }
    if (resolved.mimeType !== 'application/vnd.google-apps.folder') {
      return statusView({
        ...base,
        configured: true,
        ready: false,
        folder_ok: false,
        folder_name: name,
        folder_kind: folderKind,
        message: 'Указанный ID не является папкой.',
      });
    }

    const probe = await probeFolderWrite(client.drive, resolved.id);
    if (!probe.ok) {
      return statusView({
        ...base,
        configured: true,
        ready: false,
        folder_ok: false,
        folder_name: name,
        folder_kind: folderKind,
        message:
          probe.error ||
          (folderKind === 'my_drive' && !oauthConnected
            ? 'Service account не может писать в обычную папку Gmail. Нажмите «Войти через Google».'
            : 'Нет права записи в папку.'),
      });
    }

    const who = oauthConnected
      ? `Google-аккаунт ${emailMasked ?? ''}`
      : `SA ${emailMasked ?? ''}`.trim();
    return statusView({
      ...base,
      configured: true,
      ready: true,
      folder_ok: true,
      folder_name: name,
      folder_kind: folderKind,
      message: `Готово: папка «${name}», ${who}`.trim(),
    });
  } catch (e) {
    const msg = formatDriveApiError(e);
    return statusView({
      ...base,
      configured: true,
      ready: false,
      folder_ok: false,
      message: `Нет доступа к папке: ${msg}`,
    });
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
  const resolved = await resolveDriveFolderId(drive, folderId);
  if (resolved.trashed) throw new Error('Google Drive: папка в корзине.');
  if (resolved.mimeType && resolved.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('Google Drive: указанный ID не является папкой.');
  }
  const targetFolderId = resolved.id;
  const fileName = `${opts.backupId}.tar.gz`;

  console.log(
    `[drive-backup] upload start ${opts.backupId} size=${st.size} folder=${targetFolderId}`,
  );

  let driveFileId: string | null = null;
  let webViewLink: string | null = null;
  let sizeBytes = st.size;
  try {
    const uploaded = await uploadMediaIntoFolder(drive, {
      folderId: targetFolderId,
      fileName,
      mimeType: 'application/gzip',
      filePath: opts.archivePath,
      requestBody: {
        name: fileName,
        parents: [targetFolderId],
        description: `Источник жизни backup ${opts.backupId}`,
        mimeType: 'application/gzip',
        appProperties: {
          istochnik_backup_id: opts.backupId,
          istochnik_stamp: stamp,
          istochnik_kind: 'archive',
        },
      },
    });
    driveFileId = uploaded.id;
    webViewLink = uploaded.webViewLink;
    sizeBytes = uploaded.sizeBytes || st.size;
  } catch (e) {
    throw new Error(formatDriveApiError(e));
  }

  // Companion meta (инвентарь/компоненты) — маленький JSON рядом
  if (opts.metaPath && fs.existsSync(opts.metaPath) && driveFileId) {
    try {
      await uploadMediaIntoFolder(drive, {
        folderId: targetFolderId,
        fileName: `${opts.backupId}${META_SUFFIX}`,
        mimeType: 'application/json',
        filePath: opts.metaPath,
        requestBody: {
          name: `${opts.backupId}${META_SUFFIX}`,
          parents: [targetFolderId],
          mimeType: 'application/json',
          appProperties: {
            istochnik_backup_id: opts.backupId,
            istochnik_kind: 'meta',
          },
        },
      });
    } catch (e) {
      console.warn('[drive-backup] meta upload failed:', formatDriveApiError(e));
    }
  }

  const message = `Загружено на Google Drive (${(sizeBytes / (1024 * 1024)).toFixed(2)} МБ).`;
  console.log(`[drive-backup] upload ok ${opts.backupId} fileId=${driveFileId}`);

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

/**
 * Сначала пустой файл с parents (квота владельца папки), затем media update.
 * Одношаговый files.create+media часто кладёт архив в скрытый диск SA (квота 0).
 */
async function uploadMediaIntoFolder(
  drive: DriveClient,
  opts: {
    folderId: string;
    fileName: string;
    mimeType: string;
    filePath: string;
    requestBody: {
      name?: string | null;
      parents?: string[] | null;
      description?: string | null;
      mimeType?: string | null;
      appProperties?: { [key: string]: string } | null;
    };
  },
): Promise<{ id: string; webViewLink: string | null; sizeBytes: number }> {
  let fileId = await findExistingBackupFile(drive, opts.folderId, opts.fileName);
  if (!fileId) {
    const created = await drive.files.create(
      {
        requestBody: opts.requestBody,
        fields: 'id, parents, webViewLink',
        supportsAllDrives: true,
      },
      DRIVE_HTTP_OPTS,
    );
    fileId = created.data.id ?? null;
    const parents = (created.data as { parents?: string[] }).parents ?? [];
    if (fileId && !parents.includes(opts.folderId)) {
      await drive.files.update(
        {
          fileId,
          addParents: opts.folderId,
          removeParents: parents.filter((p) => p !== opts.folderId).join(',') || undefined,
          supportsAllDrives: true,
          fields: 'id, parents',
        },
        DRIVE_HTTP_OPTS,
      );
    }
  }
  if (!fileId) {
    throw new Error('Google Drive: API не вернул id файла');
  }

  try {
    const updated = await drive.files.update(
      {
        fileId,
        media: {
          mimeType: opts.mimeType,
          body: fs.createReadStream(opts.filePath, { highWaterMark: 8 * 1024 * 1024 }),
        },
        fields: 'id, name, size, webViewLink, parents',
        supportsAllDrives: true,
      },
      DRIVE_HTTP_OPTS,
    );
    const parents = (updated.data as { parents?: string[] }).parents ?? [];
    if (!parents.includes(opts.folderId)) {
      await drive.files.update(
        {
          fileId,
          addParents: opts.folderId,
          removeParents: parents.filter((p) => p !== opts.folderId).join(',') || undefined,
          supportsAllDrives: true,
          fields: 'id, parents',
        },
        DRIVE_HTTP_OPTS,
      );
    }
    return {
      id: updated.data.id ?? fileId,
      webViewLink: updated.data.webViewLink ?? null,
      sizeBytes: Number(updated.data.size ?? 0),
    };
  } catch (e) {
    const existing = await findExistingBackupFile(drive, opts.folderId, opts.fileName);
    if (!existing) {
      await drive.files.delete({ fileId, supportsAllDrives: true }).catch(() => undefined);
    }
    throw e;
  }
}

export async function listDriveBackups(folderId?: string | null): Promise<DriveRemoteBackup[]> {
  const settings = await loadBackupSettingsDocument();
  const folder = (folderId ?? settings.drive_folder_id)?.trim();
  if (!folder) return [];

  const { drive } = await getDriveOrThrow();
  let listFolder = folder;
  try {
    listFolder = (await resolveDriveFolderId(drive, folder)).id;
  } catch {
    listFolder = folder;
  }

  const items: DriveRemoteBackup[] = [];
  const metaIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${listFolder}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, size, createdTime, webViewLink, appProperties)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
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
  if (!folder) return { deleted: [] };

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
  const parsed = parseDriveServiceAccountJson(json);
  if (!parsed) {
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
