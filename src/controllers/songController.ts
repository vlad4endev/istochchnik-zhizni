import type { Request, Response } from 'express';

import { canModerateCatalog, normalizeAppRole, type AppRole } from '../types/appRole';
import type { SongListFilters } from '../services/songService';
import {
  addFavorite,
  createSong,
  deleteSong,
  getSongById,
  getVersionFlags,
  listPublishedSongs,
  recordSongOpened,
  removeFavorite,
  updateSong,
} from '../services/songService';

type AuthReq = Request & { authUserId?: number; authUserRole?: AppRole };

function roleOf(req: AuthReq): AppRole {
  return normalizeAppRole(req.authUserRole);
}

function parseSongListFilters(req: Request): SongListFilters {
  const q = req.query as Record<string, string | string[] | undefined>;
  const filters: SongListFilters = {};
  const qs = typeof q.q === 'string' ? q.q : Array.isArray(q.q) ? q.q[0] : '';
  if (qs && qs.trim()) filters.q = qs.trim();
  const num = (v: unknown): number | undefined => {
    if (typeof v !== 'string' || !v.trim()) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const tempoMin = num(q.tempoMin);
  const tempoMax = num(q.tempoMax);
  if (tempoMin !== undefined) filters.tempoMin = tempoMin;
  if (tempoMax !== undefined) filters.tempoMax = tempoMax;
  const key = typeof q.key === 'string' ? q.key.trim() : '';
  if (key) filters.key = key;
  const tagsRaw =
    typeof q.tags === 'string' ? q.tags : Array.isArray(q.tags) ? q.tags[0] : '';
  if (tagsRaw && tagsRaw.trim()) {
    filters.tags = tagsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return filters;
}

function parseTagsField(body: { tags?: unknown }): string[] | undefined {
  const raw = body.tags;
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

export async function listSongs(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    const memberId = r.authUserId ?? null;
    const filters = parseSongListFilters(req);
    const songs = await listPublishedSongs(memberId, filters);
    res.json(songs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось загрузить песни' });
  }
}

export async function getSong(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const r = req as AuthReq;
    const song = await getSongById(id, r.authUserId ?? null);
    if (!song) {
      res.status(404).json({ error: 'Не найдено' });
      return;
    }
    res.json(song);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function versionFlags(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const raw = req.query.songIds;
    const ids =
      typeof raw === 'string'
        ? raw
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isInteger(n) && n > 0)
        : [];
    const flags = await getVersionFlags(r.authUserId, ids);
    res.json(flags);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function addFavoriteHandler(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    await addFavorite(r.authUserId, id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function removeFavoriteHandler(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    await removeFavorite(r.authUserId, id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function recordSongOpenedHandler(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    await recordSongOpened(r.authUserId, id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function createSongHandler(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    if (!canModerateCatalog(roleOf(r))) {
      res.status(403).json({ error: 'Недостаточно прав для редактирования каталога' });
      return;
    }
    const body = req.body as {
      song_number?: number | string | null;
      title?: string;
      content?: string;
      default_key?: string | null;
      tempo?: number | null;
      time_signature?: string | null;
      tags?: unknown;
      is_published?: boolean;
    };
    const title = typeof body.title === 'string' ? body.title : '';
    if (!title.trim()) {
      res.status(400).json({ error: 'title required' });
      return;
    }
    const songNumber =
      body.song_number == null || body.song_number === ''
        ? null
        : Number.isInteger(Number(body.song_number)) && Number(body.song_number) > 0
          ? Number(body.song_number)
          : NaN;
    if (Number.isNaN(songNumber)) {
      res.status(400).json({ error: 'song_number должен быть целым положительным числом' });
      return;
    }

    const tags = parseTagsField(body);
    const song = await createSong({
      song_number: songNumber,
      title,
      content: typeof body.content === 'string' ? body.content : '',
      default_key: body.default_key,
      tempo: body.tempo ?? null,
      time_signature: body.time_signature ?? null,
      ...(tags !== undefined ? { tags } : {}),
      is_published: body.is_published,
      created_by_member_id: r.authUserId,
    });
    res.status(201).json(song);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось создать песню' });
  }
}

export async function updateSongHandler(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    if (!canModerateCatalog(roleOf(r))) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as {
      title?: string;
      content?: string;
      default_key?: string | null;
      tempo?: number | null;
      time_signature?: string | null;
      tags?: unknown;
      is_published?: boolean;
    };
    const tags = parseTagsField(body);
    const updated = await updateSong(id, {
      title: body.title,
      content: body.content,
      default_key: body.default_key,
      tempo: body.tempo,
      time_signature: body.time_signature,
      ...(tags !== undefined ? { tags } : {}),
      is_published: body.is_published,
    });
    if (!updated) {
      res.status(404).json({ error: 'Не найдено' });
      return;
    }
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function deleteSongHandler(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    if (!canModerateCatalog(roleOf(r))) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const ok = await deleteSong(id);
    if (!ok) {
      res.status(404).json({ error: 'Не найдено' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

/** Прокси к oEmbed YouTube (в браузере CORS блокирует прямой запрос). */
export async function youtubeOembed(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    if (!canModerateCatalog(roleOf(r))) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const raw = req.query.url;
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url) {
      res.status(400).json({ error: 'url required' });
      return;
    }
    if (!/(?:youtube\.com|youtu\.be)/i.test(url)) {
      res.status(400).json({ error: 'Нужна ссылка YouTube' });
      return;
    }
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const fr = await fetch(oembedUrl, { headers: { Accept: 'application/json' } });
    if (!fr.ok) {
      res.status(502).json({ error: 'Не удалось получить данные с YouTube' });
      return;
    }
    const data = (await fr.json()) as { title?: string; author_name?: string };
    res.json({
      title: data.title ?? '',
      author: data.author_name ?? '',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}
