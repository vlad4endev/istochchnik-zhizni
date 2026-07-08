import {Q} from '@nozbe/watermelondb';

import {database, getSongsCollection} from '../db';
import type Song from '../db/models/Song';
import {enqueueSyncOperation} from '../sync/syncQueue';
import {getOrCreateDeviceId} from '../shared/storage/secureStorage';
import type {SongListItem} from '../shared/songbook/types';
import {v4 as uuidv4} from 'uuid';

export function songModelToListItem(song: Song): SongListItem {
  return {
    id: song.displayId,
    song_number: song.songNumber,
    title: song.title,
    slug: song.slug,
    content: song.content,
    default_key: song.defaultKey,
    tempo: song.tempo,
    time_signature: song.timeSignature,
    tags: song.tags,
    is_published: song.isPublished,
  };
}

export class SongRepository {
  async getAll(): Promise<SongListItem[]> {
    const rows = await getSongsCollection().query(Q.sortBy('title', Q.asc)).fetch();
    return rows.filter(s => s.isPublished && !s.isDeleted).map(songModelToListItem);
  }

  async getById(id: string): Promise<SongListItem | null> {
    const byServer = await getSongsCollection().query(Q.where('server_id', id)).fetch();
    if (byServer[0] && !byServer[0].isDeleted) return songModelToListItem(byServer[0]);

    const byClient = await getSongsCollection().query(Q.where('client_id', id)).fetch();
    if (byClient[0] && !byClient[0].isDeleted) return songModelToListItem(byClient[0]);

    const byLocal = await getSongsCollection().find(id).catch(() => null);
    if (byLocal && !byLocal.isDeleted) return songModelToListItem(byLocal);

    return null;
  }

  async create(input: {
    title: string;
    slug: string;
    content?: string;
    default_key?: string | null;
  }): Promise<SongListItem> {
    const clientId = uuidv4();
    const deviceId = await getOrCreateDeviceId();
    const now = Date.now();
    const payload = {
      title: input.title.trim(),
      slug: input.slug.trim(),
      content: input.content ?? '',
      default_key: input.default_key ?? null,
      client_id: clientId,
      updated_at: now,
    };

    let created: Song | null = null;
    await database.write(async () => {
      created = await getSongsCollection().create(row => {
        row.clientId = clientId;
        row.serverId = null;
        row.title = payload.title;
        row.slug = payload.slug;
        row.content = payload.content;
        row.defaultKey = payload.default_key;
        row.tagsJson = '[]';
        row.isPublished = false;
        row.updatedAt = now;
        row.deletedAt = null;
        row.syncedAt = null;
        row.createdByDevice = deviceId;
      });
    });

    await enqueueSyncOperation({
      table: 'songs',
      operation: 'create',
      clientId,
      payload,
    });

    if (!created) throw new Error('Failed to create song locally');
    return songModelToListItem(created);
  }

  async update(
    id: string,
    patch: Partial<Pick<SongListItem, 'title' | 'slug' | 'content' | 'default_key'>>,
  ): Promise<SongListItem | null> {
    const song = await this.findModel(id);
    if (!song) return null;

    const now = Date.now();
    const payload: Record<string, unknown> = {
      title: patch.title ?? song.title,
      slug: patch.slug ?? song.slug,
      content: patch.content ?? song.content,
      default_key: patch.default_key ?? song.defaultKey,
      updated_at: now,
    };

    await database.write(async () => {
      await song.update(row => {
        if (patch.title !== undefined) row.title = patch.title;
        if (patch.slug !== undefined) row.slug = patch.slug;
        if (patch.content !== undefined) row.content = patch.content;
        if (patch.default_key !== undefined) row.defaultKey = patch.default_key;
        row.updatedAt = now;
        row.syncedAt = null;
      });
    });

    await enqueueSyncOperation({
      table: 'songs',
      operation: 'update',
      recordId: song.serverId ?? undefined,
      clientId: song.clientId ?? undefined,
      payload,
    });

    return songModelToListItem(song);
  }

  async softDelete(id: string): Promise<boolean> {
    const song = await this.findModel(id);
    if (!song) return false;

    const now = Date.now();
    await database.write(async () => {
      await song.update(row => {
        row.deletedAt = now;
        row.updatedAt = now;
        row.syncedAt = null;
      });
    });

    await enqueueSyncOperation({
      table: 'songs',
      operation: 'delete',
      recordId: song.serverId ?? undefined,
      clientId: song.clientId ?? undefined,
      payload: {updated_at: now, deleted_at: now},
    });

    return true;
  }

  private async findModel(id: string): Promise<Song | null> {
    const byServer = await getSongsCollection().query(Q.where('server_id', id)).fetch();
    if (byServer[0]) return byServer[0];
    const byClient = await getSongsCollection().query(Q.where('client_id', id)).fetch();
    if (byClient[0]) return byClient[0];
    return getSongsCollection().find(id).catch(() => null);
  }
}

export const songRepository = new SongRepository();
