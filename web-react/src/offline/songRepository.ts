import type { SongListItem, SongListQuery } from '../features/songbook/api';

import type { LocalRecord } from './db/dexieDb';
import { getEntity, listEntities } from './repositories/entityRepository';
import { getStorageAdapter } from './storage/adapter';

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

function localSongToListItem(row: LocalRecord): SongListItem {
  return {
    id: String(row.id),
    song_number: typeof row.song_number === 'number' ? row.song_number : null,
    title: String(row.title ?? ''),
    slug: String(row.slug ?? ''),
    content: String(row.content ?? ''),
    default_key: row.default_key != null ? String(row.default_key) : null,
    tempo: typeof row.tempo === 'number' ? row.tempo : null,
    time_signature: row.time_signature != null ? String(row.time_signature) : null,
    tags: parseTags(row.tags),
    is_published: row.is_published !== false,
    is_favorite: Boolean(row.is_favorite),
    has_studio_version: Boolean(row.has_studio_version),
  };
}

/** Warm local songs from REST list — does not enqueue outbox (server is source of truth). */
export async function upsertSongsFromList(items: SongListItem[]): Promise<void> {
  const adapter = getStorageAdapter();
  for (const item of items) {
    const id = String(item.id);
    const existing = await adapter.getById('songs', id);
    if (existing?._syncStatus === 'local') continue;
    await adapter.put('songs', {
      ...(existing ?? {}),
      id,
      song_number: item.song_number,
      title: item.title,
      slug: item.slug,
      content: item.content,
      default_key: item.default_key,
      tempo: item.tempo,
      time_signature: item.time_signature,
      tags: item.tags ?? [],
      is_published: item.is_published,
      is_favorite: item.is_favorite,
      has_studio_version: item.has_studio_version,
      updated_at: existing?.updated_at ?? new Date().toISOString(),
      deleted_at: null,
      _syncStatus: 'synced',
    });
  }
}

export async function listOfflineSongs(params?: SongListQuery): Promise<SongListItem[]> {
  const all = await listEntities('songs');
  let rows = all.filter((s) => !s.deleted_at && s.is_published !== false);

  const q = params?.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (s) =>
        String(s.title ?? '')
          .toLowerCase()
          .includes(q) ||
        String(s.default_key ?? '')
          .toLowerCase()
          .includes(q) ||
        String(s.song_number ?? '').includes(q),
    );
  }
  if (params?.key?.trim()) {
    const key = params.key.trim().toLowerCase();
    rows = rows.filter((s) => String(s.default_key ?? '').toLowerCase() === key);
  }
  if (params?.tempoMin != null) {
    rows = rows.filter((s) => typeof s.tempo === 'number' && s.tempo >= params.tempoMin!);
  }
  if (params?.tempoMax != null) {
    rows = rows.filter((s) => typeof s.tempo === 'number' && s.tempo <= params.tempoMax!);
  }
  if (params?.tags?.length) {
    const wanted = new Set(params.tags.map((t) => t.toLowerCase()));
    rows = rows.filter((s) => parseTags(s.tags).some((t) => wanted.has(t.toLowerCase())));
  }

  rows.sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), 'ru'));
  return rows.map(localSongToListItem);
}

export async function getOfflineSongById(id: number | string): Promise<SongListItem | null> {
  const row = await getEntity('songs', String(id));
  if (!row || row.deleted_at) return null;
  return localSongToListItem(row);
}

export async function countOfflineSongs(): Promise<number> {
  const all = await listEntities('songs');
  return all.filter((s) => !s.deleted_at && s.is_published !== false).length;
}
