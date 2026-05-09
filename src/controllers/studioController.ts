import type { Request, Response } from 'express';

import { canAccessStudio, canModerateCatalog, normalizeAppRole, type AppRole } from '../types/appRole';
import { query } from '../config/db';
import { listImportedSandboxSongsForStudio, listRecentSongs } from '../services/songService';
import {
  addSetlistItem,
  createDraft,
  createSetlist,
  deleteDraft,
  deleteSetlist,
  getInstrumentSettings,
  getPerformancePayload,
  getStudioVersionForSong,
  listDrafts,
  listMyStudioVersions,
  listSetlistItems,
  listSetlists,
  patchInstrumentSettings,
  removeSetlistItem,
  reorderSetlistItems,
  updateDraft,
  updateSetlist,
  updateSetlistItemMusicianNotes,
  upsertStudioVersion,
} from '../services/studioService';
import { AiAgentError, improveChordPlacementWithAi } from '../services/studioAiChordService';

type AuthReq = Request & { authUserId?: number; authUserRole?: AppRole };

function roleOf(req: AuthReq): AppRole {
  return normalizeAppRole(req.authUserRole);
}

function normalizeMinistryDirection(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

async function hasMusicMinistryDirection(memberId: number): Promise<boolean> {
  const r = await query(`select ministry_direction from public.members where id = $1 limit 1`, [memberId]);
  const raw = (r.rows[0] as { ministry_direction?: string } | undefined)?.ministry_direction;
  const v = normalizeMinistryDirection(raw);
  if (!v) return false;
  const target = normalizeMinistryDirection('Музыкальное служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryDirection(s))
    .some((s) => s === target || s.includes(target));
}

async function ensureStudio(req: AuthReq, res: Response): Promise<boolean> {
  if (!req.authUserId) {
    res.status(401).json({ error: 'Требуется вход' });
    return false;
  }
  if (!canAccessStudio(normalizeAppRole(req.authUserRole))) {
    try {
      const ok = await hasMusicMinistryDirection(req.authUserId);
      if (!ok) {
        res.status(403).json({ error: 'Нет доступа к студии' });
        return false;
      }
    } catch (e) {
      console.error('[studio] ensureStudio ministry_direction lookup failed:', e);
      res.status(500).json({ error: 'Не удалось проверить права доступа' });
      return false;
    }
  }
  return true;
}

export async function forkVersion(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const songId = Number(req.params.songId);
    if (!Number.isInteger(songId) || songId <= 0) {
      res.status(400).json({ error: 'Invalid songId' });
      return;
    }
    const body = req.body as { custom_content?: string | null; custom_key?: string | null };
    const version = await upsertStudioVersion(
      r.authUserId!,
      songId,
      body.custom_content ?? null,
      body.custom_key ?? null
    );
    res.status(201).json(version);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function putVersion(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const songId = Number(req.params.songId);
    if (!Number.isInteger(songId) || songId <= 0) {
      res.status(400).json({ error: 'Invalid songId' });
      return;
    }
    const body = req.body as { custom_content?: string | null; custom_key?: string | null };
    const version = await upsertStudioVersion(
      r.authUserId!,
      songId,
      body.custom_content ?? null,
      body.custom_key ?? null
    );
    res.json(version);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function getMyVersions(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const rows = await listMyStudioVersions(r.authUserId!);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function getVersionForSong(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const songId = Number(req.params.songId);
    if (!Number.isInteger(songId) || songId <= 0) {
      res.status(400).json({ error: 'Invalid songId' });
      return;
    }
    const v = await getStudioVersionForSong(r.authUserId!, songId);
    if (!v) {
      // Не считаем отсутствие личной версии ошибкой запроса — фронту нужен "пустой" ответ.
      res.json(null);
      return;
    }
    res.json(v);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function draftsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    res.json(await listDrafts(r.authUserId!));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function draftsCreate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const body = req.body as { title?: string; content?: string };
    const draft = await createDraft(
      r.authUserId!,
      typeof body.title === 'string' ? body.title : '',
      typeof body.content === 'string' ? body.content : ''
    );
    res.status(201).json(draft);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function draftsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as { title?: string; content?: string };
    const updated = await updateDraft(r.authUserId!, id, body);
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

export async function draftsDelete(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const ok = await deleteDraft(r.authUserId!, id);
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

export async function instrumentsGet(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    res.json(await getInstrumentSettings(r.authUserId!));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function instrumentsPatch(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'JSON object required' });
      return;
    }
    res.json(await patchInstrumentSettings(r.authUserId!, body));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function recentSongsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const limRaw = req.query.limit;
    let limit = 10;
    if (typeof limRaw === 'string') {
      const n = Number(limRaw);
      if (Number.isInteger(n) && n > 0 && n <= 50) limit = n;
    }
    res.json(await listRecentSongs(r.authUserId!, limit));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

/** GET /api/studio/imported-songs — черновики импорта (тег и/или imported_at), без query-string кириллицы. */
export async function importedSongsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    let restrictToCreatorId: number | undefined;
    if (!canModerateCatalog(roleOf(r))) {
      const ok = await hasMusicMinistryDirection(r.authUserId!);
      if (!ok) {
        restrictToCreatorId = r.authUserId;
      }
    }

    const songs = await listImportedSandboxSongsForStudio(r.authUserId!, restrictToCreatorId);
    res.json(songs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось загрузить импортированные песни' });
  }
}

export async function setlistsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    res.json(await listSetlists(r.authUserId!));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function setlistsCreate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const body = req.body as { title?: string; event_date?: string | null };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'title required' });
      return;
    }
    const eventDate =
      body.event_date === null || body.event_date === undefined
        ? null
        : String(body.event_date).slice(0, 10);
    res.status(201).json(await createSetlist(r.authUserId!, title, eventDate));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function setlistsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as {
      title?: string;
      event_date?: string | null;
      is_public?: boolean;
    };
    const updated = await updateSetlist(r.authUserId!, id, {
      title: body.title,
      event_date: body.event_date,
      is_public: body.is_public,
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

export async function setlistsDelete(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const ok = await deleteSetlist(r.authUserId!, id);
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

export async function setlistItemsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const setlistId = Number(req.params.id);
    if (!Number.isInteger(setlistId) || setlistId <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    res.json(await listSetlistItems(r.authUserId!, setlistId));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function setlistItemsAdd(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const setlistId = Number(req.params.id);
    if (!Number.isInteger(setlistId) || setlistId <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as { song_id?: number; studio_version_id?: number | null };
    const songId = body.song_id;
    if (!Number.isInteger(songId) || !songId || songId <= 0) {
      res.status(400).json({ error: 'song_id required' });
      return;
    }
    const sv =
      body.studio_version_id != null && Number.isInteger(body.studio_version_id)
        ? body.studio_version_id
        : null;
    await addSetlistItem(r.authUserId!, setlistId, songId, sv);
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Ошибка';
    res.status(500).json({ error: msg });
  }
}

export async function setlistItemsRemove(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const setlistId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(setlistId) || !Number.isInteger(itemId)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    await removeSetlistItem(r.authUserId!, setlistId, itemId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function setlistItemsReorder(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const setlistId = Number(req.params.id);
    if (!Number.isInteger(setlistId) || setlistId <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as { ordered_item_ids?: number[] };
    const ids = Array.isArray(body.ordered_item_ids) ? body.ordered_item_ids : [];
    if (!ids.every((x) => Number.isInteger(x) && x > 0)) {
      res.status(400).json({ error: 'ordered_item_ids must be positive integers' });
      return;
    }
    await reorderSetlistItems(r.authUserId!, setlistId, ids);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function setlistItemPatch(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const setlistId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(setlistId) || setlistId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as { musician_notes?: unknown };
    if (body.musician_notes === undefined) {
      res.status(400).json({ error: 'musician_notes required' });
      return;
    }
    const ok = await updateSetlistItemMusicianNotes(r.authUserId!, setlistId, itemId, body.musician_notes);
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

export async function performanceGet(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const setlistId = Number(req.params.id);
    if (!Number.isInteger(setlistId) || setlistId <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const payload = await getPerformancePayload(r.authUserId!, setlistId);
    if (!payload) {
      res.status(404).json({ error: 'Не найдено' });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function postAiChordPlacement(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    const body = req.body as { content?: unknown } | null;
    const content = typeof body?.content === 'string' ? body.content : '';
    if (!content.trim()) {
      res.status(400).json({ error: 'Ожидается content (строка)' });
      return;
    }

    const out = await improveChordPlacementWithAi(content);
    res.json(out);
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
    const msg = e instanceof Error ? e.message : 'Не удалось расставить аккорды';
    res.status(422).json({ error: msg });
  }
}
