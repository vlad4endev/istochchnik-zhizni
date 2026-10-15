/**
 * Расширение полного бекапа: инвентарь БД, снимок настроек, сервера,
 * сводка переписок и экспорт файлов из Supabase Storage.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { query } from '../config/db';
import {
  downloadBucketObject,
  isSupabaseStorageConfigured,
  messengerBucket,
  userMediaBucket,
} from '../lib/supabaseStorage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SENSITIVE_SETTING_KEYS = new Set([
  'telegram_bot_token',
  'sms_api_id',
  'sms_api_password',
  'sms_api_key',
  'firebase_private_key',
  'vapid_private_key',
  'backup_encrypt_passphrase',
]);

/** Таблицы, которые входят в «полный» снимок данных (счётчики). */
const INVENTORY_TABLES = [
  'members',
  'global_settings',
  'church_events',
  'ministries',
  'broadcasts',
  'conversations',
  'conversation_participants',
  'messages',
  'read_receipts',
  'message_reactions',
  'message_poll_votes',
  'chat_pins',
  'user_profiles',
  'profile_posts',
  'profile_stories',
  'songs',
  'studio_versions',
  'studio_drafts',
  'push_subscriptions',
  'auth_sessions',
  'auth_refresh_sessions',
  'app_logs',
  'telegram_chats',
  'telegram_send_logs',
] as const;

export interface BackupComponentsSummary {
  database: boolean;
  uploads: boolean;
  secrets: boolean;
  env_keys: boolean;
  env_full_encrypted: boolean;
  inventory: boolean;
  settings_snapshot: boolean;
  server_snapshot: boolean;
  messenger_summary: boolean;
  storage: boolean;
  storage_object_count: number;
  storage_bytes: number;
}

export interface BackupInventoryDocument {
  version: 1;
  created_at: string;
  tables: Record<string, number | null>;
  messenger: {
    conversations: number;
    messages: number;
    participants: number;
    reactions: number;
    poll_votes: number;
    pins: number;
  };
  members: {
    total: number;
    active: number;
    admins: number;
  };
  notes: string[];
}

export interface BackupDetailView {
  id: string;
  components: BackupComponentsSummary;
  inventory: BackupInventoryDocument | null;
  manifest_text: string | null;
  server: Record<string, unknown> | null;
  settings_meta: { keys: string[]; redacted_keys: string[] } | null;
  messenger_summary: {
    conversation_count: number;
    total_messages: number;
    sample: Array<{
      id: number;
      title: string | null;
      kind: string | null;
      message_count: number;
      last_message_at: string | null;
    }>;
  } | null;
  storage: {
    configured: boolean;
    buckets: Array<{ name: string; objects: number; bytes: number; error?: string }>;
  } | null;
}

function createStorageClient(): SupabaseClient | null {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function tableCount(table: string): Promise<number | null> {
  try {
    const result = await query(`SELECT COUNT(*)::bigint AS c FROM ${table}`);
    const raw = result.rows[0]?.c;
    return typeof raw === 'string' ? Number(raw) : Number(raw ?? 0);
  } catch {
    return null;
  }
}

async function safeQueryCount(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const result = await query(sql, params);
    const raw = result.rows[0]?.c;
    return typeof raw === 'string' ? Number(raw) : Number(raw ?? 0);
  } catch {
    return 0;
  }
}

export async function buildInventoryDocument(): Promise<BackupInventoryDocument> {
  const tables: Record<string, number | null> = {};
  const notes: string[] = [];

  for (const table of INVENTORY_TABLES) {
    const count = await tableCount(table);
    tables[table] = count;
    if (count === null) notes.push(`table_missing_or_inaccessible:${table}`);
  }

  const membersTotal = tables.members ?? 0;
  const membersActive = await safeQueryCount(
    `SELECT COUNT(*)::bigint AS c FROM members WHERE COALESCE(is_active, TRUE) = TRUE`,
  );
  const membersAdmins = await safeQueryCount(
    `SELECT COUNT(*)::bigint AS c FROM members
     WHERE app_role = 'admin' OR 'admin' = ANY(COALESCE(app_roles, ARRAY[]::text[]))`,
  );

  return {
    version: 1,
    created_at: new Date().toISOString(),
    tables,
    messenger: {
      conversations: tables.conversations ?? 0,
      messages: tables.messages ?? 0,
      participants: tables.conversation_participants ?? 0,
      reactions: tables.message_reactions ?? 0,
      poll_votes: tables.message_poll_votes ?? 0,
      pins: tables.chat_pins ?? 0,
    },
    members: {
      total: membersTotal ?? 0,
      active: membersActive,
      admins: membersAdmins,
    },
    notes,
  };
}

function redactSettingsRow(row: Record<string, unknown>): {
  data: Record<string, unknown>;
  redacted_keys: string[];
} {
  const data: Record<string, unknown> = {};
  const redacted_keys: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    const lower = key.toLowerCase();
    const sensitive =
      SENSITIVE_SETTING_KEYS.has(lower) ||
      /token|password|secret|private_key|api_key|passphrase/i.test(key);
    if (sensitive && value != null && String(value).length > 0) {
      data[key] = '[REDACTED]';
      redacted_keys.push(key);
    } else {
      data[key] = value;
    }
  }
  return { data, redacted_keys };
}

export async function buildSettingsSnapshot(): Promise<{
  document: Record<string, unknown>;
  keys: string[];
  redacted_keys: string[];
} | null> {
  try {
    const result = await query(`SELECT * FROM global_settings WHERE id = 1 LIMIT 1`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return {
        document: { version: 1, created_at: new Date().toISOString(), row: null },
        keys: [],
        redacted_keys: [],
      };
    }
    const { data, redacted_keys } = redactSettingsRow(row);
    return {
      document: {
        version: 1,
        created_at: new Date().toISOString(),
        source: 'global_settings',
        note: 'Секреты (токены, ключи) заменены на [REDACTED]; полные значения в db.dump.gz',
        row: data,
      },
      keys: Object.keys(row).sort(),
      redacted_keys,
    };
  } catch (e) {
    return {
      document: {
        version: 1,
        created_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      },
      keys: [],
      redacted_keys: [],
    };
  }
}

export async function buildMessengerSummary(): Promise<{
  conversation_count: number;
  total_messages: number;
  conversations: Array<{
    id: number;
    title: string | null;
    kind: string | null;
    message_count: number;
    last_message_at: string | null;
  }>;
}> {
  try {
    const list = await query(
      `SELECT
         c.id,
         c.title,
         c.type::text AS kind,
         COALESCE(
           (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND COALESCE(m.is_deleted, FALSE) = FALSE),
           0
         ) AS message_count,
         (
           SELECT MAX(m.created_at)
           FROM messages m
           WHERE m.conversation_id = c.id
         ) AS last_message_at
       FROM conversations c
       ORDER BY last_message_at DESC NULLS LAST, c.id DESC
       LIMIT 500`,
    );
    const conversations = list.rows.map((r) => ({
      id: Number(r.id),
      title: typeof r.title === 'string' ? r.title : null,
      kind: typeof r.kind === 'string' ? r.kind : null,
      message_count: Number(r.message_count ?? 0),
      last_message_at: r.last_message_at
        ? new Date(r.last_message_at as string | Date).toISOString()
        : null,
    }));
    const totalMessages = conversations.reduce((s, c) => s + c.message_count, 0);
    return {
      conversation_count: conversations.length,
      total_messages: totalMessages,
      conversations,
    };
  } catch {
    // Fallback if column names differ — minimal empty summary
    const count = await tableCount('conversations');
    const msgCount = await tableCount('messages');
    return {
      conversation_count: count ?? 0,
      total_messages: msgCount ?? 0,
      conversations: [],
    };
  }
}

async function fileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(filePath);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
  return hash.digest('hex');
}

async function hashIfExists(root: string, relative: string): Promise<string | null> {
  const full = path.join(root, relative);
  try {
    const st = await fsp.stat(full);
    if (!st.isFile()) return null;
    return await fileSha256(full);
  } catch {
    return null;
  }
}

export async function buildServerSnapshot(projectRoot: string): Promise<Record<string, unknown>> {
  let packageJson: { name?: string; version?: string } = {};
  try {
    const raw = await fsp.readFile(path.join(projectRoot, 'package.json'), 'utf8');
    packageJson = JSON.parse(raw) as { name?: string; version?: string };
  } catch {
    /* ignore */
  }

  let gitSha: string | null = null;
  try {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    if (r.status === 0) gitSha = r.stdout.trim() || null;
  } catch {
    gitSha = null;
  }

  const composeFiles = [
    'docker-compose.yml',
    'docker-compose.prod.yml',
    'docker-compose.local.yml',
    'docker-compose.prod.overlay.yml',
    'Dockerfile',
    'nginx.conf',
    'deploy/nginx.conf',
  ];
  const composeHashes: Record<string, string | null> = {};
  for (const f of composeFiles) {
    composeHashes[f] = await hashIfExists(projectRoot, f);
  }

  const envKeys: string[] = [];
  try {
    const envRaw = await fsp.readFile(path.join(projectRoot, '.env'), 'utf8');
    for (const line of envRaw.split('\n')) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (m) envKeys.push(m[1]!);
    }
  } catch {
    /* no .env */
  }

  const mem = process.memoryUsage();
  return {
    version: 1,
    created_at: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptime_sec: Math.round(os.uptime()),
    node: process.version,
    pid: process.pid,
    cwd: process.cwd(),
    project_root: projectRoot,
    package_name: packageJson.name ?? null,
    package_version: packageJson.version ?? null,
    git_sha: gitSha,
    cpus: os.cpus().length,
    total_mem_bytes: os.totalmem(),
    free_mem_bytes: os.freemem(),
    process_rss_bytes: mem.rss,
    process_heap_used_bytes: mem.heapUsed,
    env_key_names: envKeys.sort(),
    env_key_count: envKeys.length,
    compose_and_deploy_hashes: composeHashes,
    backup_dir: process.env.BACKUP_DIR ?? null,
    uploads_dir: process.env.UPLOADS_DIR ?? null,
    database_url_set: Boolean(process.env.DATABASE_URL?.trim()),
    supabase_storage_configured: isSupabaseStorageConfigured(),
    node_env: process.env.NODE_ENV ?? null,
  };
}

type ListedObject = { path: string; size: number };

async function listBucketObjectsRecursive(
  client: SupabaseClient,
  bucket: string,
  prefix = '',
  depth = 0,
): Promise<ListedObject[]> {
  if (depth > 40) return [];
  const out: ListedObject[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      throw new Error(`storage_list_failed:${bucket}:${prefix}:${error.message}`);
    }
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const name = String(row.name ?? '').trim();
      if (!name || name === '.emptyFolderPlaceholder') continue;
      const childPath = prefix ? `${prefix}/${name}` : name;
      const meta = row as { id?: string | null; metadata?: { size?: number } | null };
      // Folders often have id === null in Supabase Storage
      const isFolder = meta.id == null && !meta.metadata;
      if (isFolder) {
        const nested = await listBucketObjectsRecursive(client, bucket, childPath, depth + 1);
        out.push(...nested);
      } else {
        out.push({
          path: childPath,
          size: Number(meta.metadata?.size ?? 0),
        });
      }
    }

    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function exportSupabaseStorageToDir(
  destRoot: string,
  options?: { maxObjects?: number; maxBytes?: number },
): Promise<{
  configured: boolean;
  buckets: Array<{ name: string; objects: number; bytes: number; error?: string }>;
  object_count: number;
  bytes: number;
}> {
  const maxObjects = options?.maxObjects ?? 50_000;
  const maxBytes = options?.maxBytes ?? 8 * 1024 * 1024 * 1024; // 8 GiB soft cap

  if (!isSupabaseStorageConfigured()) {
    await fsp.mkdir(destRoot, { recursive: true });
    await fsp.writeFile(
      path.join(destRoot, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          created_at: new Date().toISOString(),
          configured: false,
          note: 'Supabase Storage не настроен — файлы чата/медиа в облаке не экспортированы',
          buckets: [],
        },
        null,
        2,
      ),
      'utf8',
    );
    return { configured: false, buckets: [], object_count: 0, bytes: 0 };
  }

  const client = createStorageClient();
  if (!client) {
    return { configured: false, buckets: [], object_count: 0, bytes: 0 };
  }

  const bucketNames = Array.from(
    new Set([messengerBucket(), userMediaBucket()].filter(Boolean)),
  );
  const bucketsMeta: Array<{ name: string; objects: number; bytes: number; error?: string }> = [];
  let totalObjects = 0;
  let totalBytes = 0;

  await fsp.mkdir(destRoot, { recursive: true });

  for (const bucket of bucketNames) {
    const bucketDir = path.join(destRoot, bucket);
    await fsp.mkdir(bucketDir, { recursive: true });
    try {
      const objects = await listBucketObjectsRecursive(client, bucket);
      let bucketBytes = 0;
      let saved = 0;
      for (const obj of objects) {
        if (totalObjects >= maxObjects || totalBytes >= maxBytes) {
          bucketsMeta.push({
            name: bucket,
            objects: saved,
            bytes: bucketBytes,
            error: 'limit_reached',
          });
          break;
        }
        const { buffer } = await downloadBucketObject({ bucket, objectPath: obj.path });
        const outPath = path.join(bucketDir, obj.path);
        await fsp.mkdir(path.dirname(outPath), { recursive: true });
        await fsp.writeFile(outPath, buffer);
        bucketBytes += buffer.length;
        totalBytes += buffer.length;
        totalObjects += 1;
        saved += 1;
      }
      if (!bucketsMeta.some((b) => b.name === bucket)) {
        bucketsMeta.push({ name: bucket, objects: saved, bytes: bucketBytes });
      }
    } catch (e) {
      bucketsMeta.push({
        name: bucket,
        objects: 0,
        bytes: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await fsp.writeFile(
    path.join(destRoot, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        created_at: new Date().toISOString(),
        configured: true,
        buckets: bucketsMeta,
        object_count: totalObjects,
        bytes: totalBytes,
        note: 'Вложения чата и user-media; метаданные переписок — в db.dump.gz',
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    configured: true,
    buckets: bucketsMeta,
    object_count: totalObjects,
    bytes: totalBytes,
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function rewriteChecksums(dirPath: string): Promise<void> {
  const lines: string[] = [];
  async function walk(rel: string): Promise<void> {
    const full = path.join(dirPath, rel);
    const entries = await fsp.readdir(full, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'checksums.sha256' || e.name.endsWith('.partial')) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(childRel);
      else if (e.isFile()) {
        const digest = await fileSha256(path.join(dirPath, childRel));
        lines.push(`${digest}  ./${childRel.replace(/\\/g, '/')}`);
      }
    }
  }
  await walk('');
  lines.sort((a, b) => a.localeCompare(b));
  await fsp.writeFile(path.join(dirPath, 'checksums.sha256'), `${lines.join('\n')}\n`, 'utf8');
}

function appendManifestLines(existing: string, extra: string[]): string {
  const body = existing.trimEnd();
  const block = ['--- detailed_snapshot ---', ...extra].join('\n');
  if (body.includes('--- detailed_snapshot ---')) {
    return `${body.split('--- detailed_snapshot ---')[0]!.trimEnd()}\n${block}\n`;
  }
  return `${body}\n${block}\n`;
}

/**
 * Дополняет каталог бекапа детальным снимком (после scripts/backup.sh).
 * Обновляет MANIFEST.txt и checksums.sha256.
 */
export async function enrichBackupDirectory(
  dirPath: string,
  projectRoot: string,
  options?: { includeStorage?: boolean },
): Promise<BackupComponentsSummary> {
  const includeStorage =
    options?.includeStorage !== false && process.env.BACKUP_SKIP_STORAGE !== '1';

  const inventory = await buildInventoryDocument();
  await fsp.writeFile(
    path.join(dirPath, 'inventory.json'),
    JSON.stringify(inventory, null, 2),
    'utf8',
  );

  const settings = await buildSettingsSnapshot();
  if (settings) {
    await fsp.writeFile(
      path.join(dirPath, 'settings.snapshot.json'),
      JSON.stringify(settings.document, null, 2),
      'utf8',
    );
  }

  const server = await buildServerSnapshot(projectRoot);
  await fsp.writeFile(
    path.join(dirPath, 'server.snapshot.json'),
    JSON.stringify(server, null, 2),
    'utf8',
  );

  const messenger = await buildMessengerSummary();
  await fsp.writeFile(
    path.join(dirPath, 'messenger.summary.json'),
    JSON.stringify(
      {
        version: 1,
        created_at: new Date().toISOString(),
        note: 'Сводка переписок; полные тексты сообщений — в PostgreSQL-дампе (db.dump.gz)',
        ...messenger,
      },
      null,
      2,
    ),
    'utf8',
  );

  let storageResult = {
    configured: false,
    buckets: [] as Array<{ name: string; objects: number; bytes: number; error?: string }>,
    object_count: 0,
    bytes: 0,
  };
  if (includeStorage) {
    storageResult = await exportSupabaseStorageToDir(path.join(dirPath, 'storage'));
  } else {
    await fsp.mkdir(path.join(dirPath, 'storage'), { recursive: true });
    await fsp.writeFile(
      path.join(dirPath, 'storage', 'manifest.json'),
      JSON.stringify({
        version: 1,
        created_at: new Date().toISOString(),
        configured: isSupabaseStorageConfigured(),
        skipped: true,
        note: 'Экспорт Storage пропущен (BACKUP_SKIP_STORAGE=1)',
        buckets: [],
      }),
      'utf8',
    );
  }

  const components: BackupComponentsSummary = {
    database: await pathExists(path.join(dirPath, 'db.dump.gz')) ||
      (await pathExists(path.join(dirPath, 'db.dump.gz.enc'))),
    uploads: await pathExists(path.join(dirPath, 'uploads.tar.gz')),
    secrets:
      (await pathExists(path.join(dirPath, 'secrets.tar.gz'))) ||
      (await pathExists(path.join(dirPath, 'secrets.tar.gz.enc'))),
    env_keys: await pathExists(path.join(dirPath, 'env.keys.txt')),
    env_full_encrypted: await pathExists(path.join(dirPath, 'env.full.enc')),
    inventory: true,
    settings_snapshot: Boolean(settings),
    server_snapshot: true,
    messenger_summary: true,
    storage: includeStorage && storageResult.configured,
    storage_object_count: storageResult.object_count,
    storage_bytes: storageResult.bytes,
  };

  await fsp.writeFile(
    path.join(dirPath, 'components.json'),
    JSON.stringify({ version: 1, created_at: new Date().toISOString(), ...components }, null, 2),
    'utf8',
  );

  const manifestPath = path.join(dirPath, 'MANIFEST.txt');
  let manifest = '';
  try {
    manifest = await fsp.readFile(manifestPath, 'utf8');
  } catch {
    manifest = `project=istochnik-zhizni\ncreated_at=${new Date().toISOString()}\n`;
  }
  const extra = [
    `detailed_snapshot=yes`,
    `inventory=yes`,
    `settings_snapshot=yes`,
    `server_snapshot=yes`,
    `messenger_summary=yes`,
    `storage_included=${components.storage ? 'yes' : 'no'}`,
    `storage_objects=${components.storage_object_count}`,
    `storage_bytes=${components.storage_bytes}`,
    `members_total=${inventory.members.total}`,
    `conversations=${inventory.messenger.conversations}`,
    `messages=${inventory.messenger.messages}`,
  ];
  await fsp.writeFile(manifestPath, appendManifestLines(manifest, extra), 'utf8');

  await rewriteChecksums(dirPath);
  return components;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readBackupDetail(
  id: string,
  dirPath: string,
): Promise<BackupDetailView> {
  const componentsFile = await readJsonFile<BackupComponentsSummary & { version?: number }>(
    path.join(dirPath, 'components.json'),
  );
  const inventory = await readJsonFile<BackupInventoryDocument>(
    path.join(dirPath, 'inventory.json'),
  );
  const server = await readJsonFile<Record<string, unknown>>(
    path.join(dirPath, 'server.snapshot.json'),
  );
  const settingsDoc = await readJsonFile<{
    row?: Record<string, unknown> | null;
  }>(path.join(dirPath, 'settings.snapshot.json'));
  const messengerDoc = await readJsonFile<{
    conversation_count?: number;
    total_messages?: number;
    conversations?: BackupDetailView['messenger_summary'] extends infer M
      ? M extends { sample: infer S }
        ? S
        : never
      : never;
  }>(path.join(dirPath, 'messenger.summary.json'));
  const storageManifest = await readJsonFile<{
    configured?: boolean;
    buckets?: Array<{ name: string; objects: number; bytes: number; error?: string }>;
  }>(path.join(dirPath, 'storage', 'manifest.json'));

  let manifest_text: string | null = null;
  try {
    manifest_text = await fsp.readFile(path.join(dirPath, 'MANIFEST.txt'), 'utf8');
  } catch {
    manifest_text = null;
  }

  const components: BackupComponentsSummary = componentsFile
    ? {
        database: Boolean(componentsFile.database),
        uploads: Boolean(componentsFile.uploads),
        secrets: Boolean(componentsFile.secrets),
        env_keys: Boolean(componentsFile.env_keys),
        env_full_encrypted: Boolean(componentsFile.env_full_encrypted),
        inventory: Boolean(componentsFile.inventory),
        settings_snapshot: Boolean(componentsFile.settings_snapshot),
        server_snapshot: Boolean(componentsFile.server_snapshot),
        messenger_summary: Boolean(componentsFile.messenger_summary),
        storage: Boolean(componentsFile.storage),
        storage_object_count: Number(componentsFile.storage_object_count ?? 0),
        storage_bytes: Number(componentsFile.storage_bytes ?? 0),
      }
    : {
        database:
          (await pathExists(path.join(dirPath, 'db.dump.gz'))) ||
          (await pathExists(path.join(dirPath, 'db.dump.gz.enc'))),
        uploads: await pathExists(path.join(dirPath, 'uploads.tar.gz')),
        secrets:
          (await pathExists(path.join(dirPath, 'secrets.tar.gz'))) ||
          (await pathExists(path.join(dirPath, 'secrets.tar.gz.enc'))),
        env_keys: await pathExists(path.join(dirPath, 'env.keys.txt')),
        env_full_encrypted: await pathExists(path.join(dirPath, 'env.full.enc')),
        inventory: await pathExists(path.join(dirPath, 'inventory.json')),
        settings_snapshot: await pathExists(path.join(dirPath, 'settings.snapshot.json')),
        server_snapshot: await pathExists(path.join(dirPath, 'server.snapshot.json')),
        messenger_summary: await pathExists(path.join(dirPath, 'messenger.summary.json')),
        storage: await pathExists(path.join(dirPath, 'storage', 'manifest.json')),
        storage_object_count: storageManifest?.buckets?.reduce((s, b) => s + (b.objects || 0), 0) ?? 0,
        storage_bytes: storageManifest?.buckets?.reduce((s, b) => s + (b.bytes || 0), 0) ?? 0,
      };

  const settingsKeys = settingsDoc?.row ? Object.keys(settingsDoc.row).sort() : [];
  const redacted = settingsKeys.filter((k) => settingsDoc?.row?.[k] === '[REDACTED]');

  const sample = Array.isArray(messengerDoc?.conversations)
    ? messengerDoc!.conversations!.slice(0, 20).map((c) => ({
        id: Number((c as { id: number }).id),
        title: (c as { title: string | null }).title ?? null,
        kind: (c as { kind: string | null }).kind ?? null,
        message_count: Number((c as { message_count: number }).message_count ?? 0),
        last_message_at: (c as { last_message_at: string | null }).last_message_at ?? null,
      }))
    : [];

  return {
    id,
    components,
    inventory,
    manifest_text,
    server,
    settings_meta: settingsDoc
      ? { keys: settingsKeys, redacted_keys: redacted }
      : null,
    messenger_summary: messengerDoc
      ? {
          conversation_count: Number(messengerDoc.conversation_count ?? sample.length),
          total_messages: Number(messengerDoc.total_messages ?? 0),
          sample,
        }
      : null,
    storage: storageManifest
      ? {
          configured: Boolean(storageManifest.configured),
          buckets: storageManifest.buckets ?? [],
        }
      : null,
  };
}

export async function summarizeComponentsFromDir(
  dirPath: string,
): Promise<BackupComponentsSummary | null> {
  if (!(await pathExists(dirPath))) return null;
  const detail = await readBackupDetail(path.basename(dirPath), dirPath);
  return detail.components;
}
