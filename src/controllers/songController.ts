import type { Request, Response } from 'express';

import {
  canDeleteCatalogSong,
  canModerateCatalog,
  normalizeAppRole,
  type AppRole,
} from '../types/appRole';
import type { SongListFilters } from '../services/songService';
import { query as dbQuery } from '../config/db';
import {
  addFavorite,
  createSong,
  deleteSong,
  getSongById,
  getVersionFlags,
  listCatalogSongsForModeration,
  listPublishedSongs,
  recordSongOpened,
  removeFavorite,
  updateSong,
} from '../services/songService';
import pdfParse from 'pdf-parse';

import { safeFetchUrlForSongImport } from '../utils/safeUrlTextFetch';
import { AiAgentError, chatCompletion } from '../ai';

type AuthReq = Request & { authUserId?: number; authUserRole?: AppRole };

function roleOf(req: AuthReq): AppRole {
  return normalizeAppRole(req.authUserRole);
}

function normalizeMinistryDirection(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

async function hasMusicMinistryDirection(memberId: number): Promise<boolean> {
  const r = await dbQuery(`select ministry_direction from public.members where id = $1 limit 1`, [memberId]);
  const raw = (r.rows[0] as { ministry_direction?: string } | undefined)?.ministry_direction;
  const v = normalizeMinistryDirection(raw);
  if (!v) return false;
  const target = normalizeMinistryDirection('Музыкальное служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryDirection(s))
    .some((s) => s === target || s.includes(target));
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

export async function listSongsForModeration(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!r.authUserId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    if (!canModerateCatalog(roleOf(r))) {
      const ok = await hasMusicMinistryDirection(r.authUserId);
      if (!ok) {
        res.status(403).json({ error: 'Недостаточно прав' });
        return;
      }
    }
    const filters = parseSongListFilters(req);
    const songs = await listCatalogSongsForModeration(r.authUserId ?? null, filters);
    res.json(songs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось загрузить каталог для модерации' });
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
      force?: boolean;
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

    // Soft-duplicate warning: let UI confirm "create anyway".
    if (body.force !== true) {
      const matches: Array<{ id: string; title: string; song_number: number | null; slug: string }> = [];
      if (songNumber != null) {
        const byNum = await dbQuery(
          `SELECT id, title, song_number, slug
           FROM songs
           WHERE song_number = $1
           ORDER BY updated_at DESC
           LIMIT 5`,
          [songNumber],
        );
        matches.push(
          ...(byNum.rows as Array<{ id: unknown; title: unknown; song_number: unknown; slug: unknown }>).map((r) => ({
            id: String(r.id),
            title: String(r.title),
            song_number: r.song_number != null ? Number(r.song_number) : null,
            slug: String(r.slug),
          })),
        );
      }
      const byTitle = await dbQuery(
        `SELECT id, title, song_number, slug
         FROM songs
         WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))
         ORDER BY updated_at DESC
         LIMIT 5`,
        [title],
      );
      for (const row of byTitle.rows as Array<{ id: unknown; title: unknown; song_number: unknown; slug: unknown }>) {
        if (matches.some((m) => String(m.id) === String(row.id))) continue;
        matches.push({
          id: String(row.id),
          title: String(row.title),
          song_number: row.song_number != null ? Number(row.song_number) : null,
          slug: String(row.slug),
        });
      }
      if (matches.length > 0) {
        res.status(409).json({
          error: 'Песня с таким номером или названием уже существует',
          matches: matches.map((m) => ({
            id: String(m.id),
            title: String(m.title),
            song_number: m.song_number != null ? Number(m.song_number) : null,
            slug: String(m.slug),
          })),
        });
        return;
      }
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
    if (!canDeleteCatalogSong(roleOf(r))) {
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

/** Прокси: загрузка текста песни по публичной ссылке (обход CORS, базовая защита от SSRF). */
export async function importUrlText(req: Request, res: Response): Promise<void> {
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
    const fetched = await safeFetchUrlForSongImport(url);
    if (fetched.kind === 'text') {
      res.json({ text: fetched.text, contentType: fetched.contentType });
      return;
    }
    let text: string;
    try {
      const parsed = await pdfParse(fetched.buffer);
      text = (parsed.text ?? '').trim();
    } catch {
      res.status(502).json({ error: 'Не удалось разобрать PDF по ссылке.' });
      return;
    }
    if (!text) {
      res.status(422).json({
        error: 'В PDF не найден текст (возможно, только изображения). Загрузите файл вручную или скопируйте текст.',
      });
      return;
    }
    res.json({ text, contentType: fetched.contentType });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка';
    if (
      msg.startsWith('Некоррект') ||
      msg.includes('Разрешены') ||
      msg.includes('недоступен') ||
      msg.startsWith('Поддерживаются')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[songs] import-url:', e);
    res.status(502).json({ error: msg || 'Не удалось загрузить по ссылке' });
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

function stripMarkdownFences(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return t;
  // ```chordpro\n...\n```
  return t.replace(/^```[a-zA-Z0-9_-]*\s*\n?/u, '').replace(/\n?```$/u, '').trim();
}

/** ИИ: разложить текст песни по блокам и вернуть ChordPro с `{sec:...}`. */
export async function aiSplitBlocksHandler(req: Request, res: Response): Promise<void> {
  const r = req as AuthReq;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход' });
    return;
  }
  if (!canModerateCatalog(roleOf(r))) {
    res.status(403).json({ error: 'Недостаточно прав для редактирования каталога' });
    return;
  }
  const body = req.body as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text : '';
  const trimmed = text.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (trimmed.length > 120_000) {
    res.status(413).json({ error: 'Слишком большой текст для ИИ. Уменьшите объём и попробуйте снова.' });
    return;
  }

  const system = [
    'Ты помощник песенника. Твоя задача — разметить текст песни по секциям (блокам) и вернуть ОДИН ChordPro-текст.',
    '',
    'ВАЖНО: Ответ должен быть ТОЛЬКО ЧИСТЫМ ТЕКСТОМ ChordPro, без Markdown, без объяснений, без JSON.',
    '',
    'Формат секций: каждая секция начинается отдельной строкой вида {sec:НАЗВАНИЕ}.',
    'Разрешённые типы секций по смыслу (используй русские названия):',
    '- Интро / Вступление',
    '- Куплет 1, Куплет 2, Куплет 3, ... (нумеруй куплеты последовательно)',
    '- Предприпев (если есть)',
    '- Припев',
    '- Бридж / Мост',
    '- Соло',
    '- Аутро / Финал',
    '',
    'Правила:',
    '- Сохраняй строки и переносы. Не ломай структуру строк.',
    '- Если в тексте уже есть аккорды в квадратных скобках [Am] — сохраняй их как есть.',
    '- Если аккорды “над строкой” (отдельной строкой) — оставляй их как строки, не пытайся переставлять символы.',
    '- Если заголовки секций уже есть (Куплет/Припев/Bridge/Chorus и т.п.) — используй их и нормализуй в {sec:...}.',
    '- Если заголовков нет, но виден повторяющийся блок — пометь повтор как {sec:Припев}, остальное как {sec:Куплет N}.',
    '- Не добавляй новых слов песни, не исправляй орфографию, не “улучшай” текст.',
  ].join('\n');

  try {
    const reply = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: trimmed },
      ],
      {
        section: 'songbook',
        temperature: 0.2,
        max_tokens: 6000,
        skipSystemPrompt: true,
      },
    );

    let out = stripMarkdownFences(String(reply ?? '')).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!out) {
      res.status(502).json({ error: 'ИИ вернул пустой ответ. Попробуйте ещё раз.' });
      return;
    }
    if (!/\{sec:/i.test(out) && !/\{section:/i.test(out)) {
      out = `{sec:Куплет 1}\n${out}`;
    }
    res.json({ chordPro: out });
  } catch (e) {
    if (e instanceof AiAgentError) {
      const status =
        e.code === 'ai_disabled'
          ? 409
          : e.code === 'ai_not_configured'
            ? 400
            : e.code === 'ai_http_error'
              ? e.status && e.status >= 400 && e.status < 600
                ? e.status
                : 502
              : 502;
      res.status(status).json({
        error: e.message,
        code: e.code,
        details: e.bodySnippet ? { bodySnippet: e.bodySnippet } : undefined,
      });
      return;
    }
    console.error('[songs] ai split-blocks error', e);
    res.status(500).json({ error: 'Не удалось выполнить разметку через ИИ' });
  }
}
