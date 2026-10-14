import type { SongListItem, SongListQuery } from '../features/songbook/api';

import { getOrCreateDeviceId, offlineDb, type OfflineSong } from './db';

function toMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : Date.now();
  }
  return Date.now();
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function offlineSongToListItem(song: OfflineSong): SongListItem {
  return {
    id: song.serverId ?? song.id.replace(/^local:/, ''),
    song_number: song.songNumber,
    title: song.title,
    slug: song.slug,
    content: song.content,
    default_key: song.defaultKey,
    tempo: song.tempo,
    time_signature: song.timeSignature,
    tags: song.tags,
    is_published: song.isPublished,
    is_favorite: song.isFavorite,
    has_studio_version: song.hasStudioVersion,
  };
}

export function syncRecordToOfflineSong(record: Record<string, unknown>): OfflineSong {
  const serverId = record.id != null ? String(record.id) : null;
  const clientId = typeof record.client_id === 'string' ? record.client_id : null;
  const deletedAt = record.deleted_at ? toMs(record.deleted_at) : null;
  return {
    id: serverId ?? (clientId ? `local:${clientId}` : `tmp-${Date.now()}`),
    serverId,
    clientId,
    songNumber: typeof record.song_number === 'number' ? record.song_number : null,
    title: String(record.title ?? ''),
    slug: String(record.slug ?? ''),
    content: String(record.content ?? ''),
    defaultKey: record.default_key != null ? String(record.default_key) : null,
    tempo: typeof record.tempo === 'number' ? record.tempo : null,
    timeSignature: record.time_signature != null ? String(record.time_signature) : null,
    tags: parseTags(record.tags),
    isPublished: record.is_published !== false,
    updatedAt: toMs(record.updated_at),
    deletedAt,
    syncedAt: Date.now(),
  };
}

export async function upsertOfflineSong(song: OfflineSong): Promise<void> {
  const existing = song.serverId
    ? await offlineDb.songs.where('serverId').equals(song.serverId).first()
    : song.clientId
      ? await offlineDb.songs.where('clientId').equals(song.clientId).first()
      : undefined;

  if (existing) {
    await offlineDb.songs.put({
      ...song,
      id: existing.id,
      isFavorite: song.isFavorite ?? existing.isFavorite,
      hasStudioVersion: song.hasStudioVersion ?? existing.hasStudioVersion,
    });
  } else {
    await offlineDb.songs.put(song);
  }
}

export async function upsertSongsFromList(items: SongListItem[]): Promise<void> {
  const now = Date.now();
  await offlineDb.transaction('rw', offlineDb.songs, async () => {
    for (const item of items) {
      const serverId = String(item.id);
      const existing = await offlineDb.songs.where('serverId').equals(serverId).first();
      const row: OfflineSong = {
        id: serverId,
        serverId,
        clientId: existing?.clientId ?? null,
        songNumber: item.song_number,
        title: item.title,
        slug: item.slug,
        content: item.content,
        defaultKey: item.default_key,
        tempo: item.tempo,
        timeSignature: item.time_signature,
        tags: item.tags ?? [],
        isPublished: item.is_published,
        isFavorite: item.is_favorite,
        hasStudioVersion: item.has_studio_version,
        updatedAt: existing?.updatedAt ?? now,
        deletedAt: null,
        syncedAt: now,
      };
      await offlineDb.songs.put(row);
    }
  });
}

export async function listOfflineSongs(params?: SongListQuery): Promise<SongListItem[]> {
  const all = await offlineDb.songs.toArray();
  let rows = all.filter((s) => !s.deletedAt && s.isPublished);

  const q = params?.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.defaultKey ?? '').toLowerCase().includes(q) ||
        String(s.songNumber ?? '').includes(q),
    );
  }
  if (params?.key?.trim()) {
    const key = params.key.trim().toLowerCase();
    rows = rows.filter((s) => (s.defaultKey ?? '').toLowerCase() === key);
  }
  if (params?.tempoMin != null) {
    rows = rows.filter((s) => s.tempo != null && s.tempo >= params.tempoMin!);
  }
  if (params?.tempoMax != null) {
    rows = rows.filter((s) => s.tempo != null && s.tempo <= params.tempoMax!);
  }
  if (params?.tags?.length) {
    const wanted = new Set(params.tags.map((t) => t.toLowerCase()));
    rows = rows.filter((s) => s.tags.some((t) => wanted.has(t.toLowerCase())));
  }

  rows.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return rows.map(offlineSongToListItem);
}

export async function getOfflineSongById(id: number | string): Promise<SongListItem | null> {
  const key = String(id);
  const byServer = await offlineDb.songs.where('serverId').equals(key).first();
  if (byServer && !byServer.deletedAt) return offlineSongToListItem(byServer);
  const byId = await offlineDb.songs.get(key);
  if (byId && !byId.deletedAt) return offlineSongToListItem(byId);
  const byLocal = await offlineDb.songs.get(`local:${key}`);
  if (byLocal && !byLocal.deletedAt) return offlineSongToListItem(byLocal);
  return null;
}

export async function enqueueSongCreate(input: {
  title: string;
  slug: string;
  content?: string;
  default_key?: string | null;
}): Promise<SongListItem> {
  const clientId = crypto.randomUUID();
  const deviceId = getOrCreateDeviceId();
  const now = Date.now();
  const song: OfflineSong = {
    id: `local:${clientId}`,
    serverId: null,
    clientId,
    songNumber: null,
    title: input.title.trim(),
    slug: input.slug.trim(),
    content: input.content ?? '',
    defaultKey: input.default_key ?? null,
    tempo: null,
    timeSignature: null,
    tags: [],
    isPublished: false,
    updatedAt: now,
    deletedAt: null,
    syncedAt: null,
  };
  await offlineDb.songs.put(song);
  await offlineDb.syncQueue.add({
    queueId: crypto.randomUUID(),
    table: 'songs',
    operation: 'create',
    recordId: null,
    clientId,
    payload: {
      title: song.title,
      slug: song.slug,
      content: song.content,
      default_key: song.defaultKey,
      client_id: clientId,
      updated_at: now,
    },
    deviceId,
    createdAt: now,
    attempts: 0,
    lastError: null,
  });
  return offlineSongToListItem(song);
}

export async function countOfflineSongs(): Promise<number> {
  return offlineDb.songs.filter((s) => !s.deletedAt && s.isPublished).count();
}
