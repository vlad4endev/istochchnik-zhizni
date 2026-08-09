import type { Request, Response } from 'express';

import {
  rolesOfSession,
  sessionCanAccessStudio,
  sessionCanModerateCatalog,
  type AppRole,
  type SessionRoleSource,
} from '../types/appRole';
import { query } from '../config/db';
import {
  getSongById,
  listImportedSandboxSongsForStudio,
  listRecentSongs,
  countMemberSongsHiddenFromPublicCatalog,
  countSongsHiddenFromPublicCatalog,
  syncMemberSongsToPublicCatalog,
  syncAllSongsToPublicCatalog,
} from '../services/songService';
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
  upsertStudioSheetVersion,
} from '../services/studioService';
import { AiAgentError, improveChordPlacementWithAi } from '../services/studioAiChordService';
import { cleanupSongWithAi } from '../services/studioAiCleanupService';
import { getServicePlanSongUsageReport } from '../services/studioSongUsageService';
import {
  applyServicePlanSongPicks,
  pickSongsForNearestServicePlan,
  AiAgentError as SongPickAiError,
} from '../services/studioSongPickService';
import {
  createStudioSongTag,
  deleteStudioSongTag,
  listStudioSongTags,
  renameStudioSongTag,
} from '../services/studioSongTagsService';

type AuthReq = Request & SessionRoleSource & { authUserId?: number; authUserRole?: AppRole };

function studioIncludeAllPlanner(req: AuthReq): boolean {
  return rolesOfSession(req).some(
    (role) => role === 'admin' || role === 'editor' || role === 'pastor' || role === 'minister',
  );
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
  if (!sessionCanAccessStudio(req)) {
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

export async function putSheetVersion(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const songId = Number(req.params.songId);
    if (!Number.isInteger(songId) || songId <= 0) {
      res.status(400).json({ error: 'Invalid songId' });
      return;
    }
    const body = req.body as {
      sheet_content?: unknown;
      sheet_key?: unknown;
      sheet_meta?: unknown;
    };
    const sheetContent = typeof body.sheet_content === 'string' ? body.sheet_content : '';
    if (!sheetContent.trim()) {
      res.status(400).json({ error: 'sheet_content required' });
      return;
    }
    const sheetKey =
      typeof body.sheet_key === 'string' && body.sheet_key.trim() ? body.sheet_key.trim() : null;
    let sheetMeta: import('../services/studioService').StudioSheetMeta | null = null;
    if (body.sheet_meta != null && typeof body.sheet_meta === 'object') {
      const m = body.sheet_meta as Record<string, unknown>;
      sheetMeta = {
        bpm: typeof m.bpm === 'number' ? m.bpm : null,
        timeSignature: typeof m.timeSignature === 'string' ? m.timeSignature : null,
        composer: typeof m.composer === 'string' ? m.composer : null,
        title: typeof m.title === 'string' ? m.title : null,
        generalNotes: typeof m.generalNotes === 'string' ? m.generalNotes : null,
      };
    }
    const version = await upsertStudioSheetVersion(
      r.authUserId!,
      songId,
      sheetContent,
      sheetKey,
      sheetMeta,
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

/** POST /api/studio/service-plan-song-pick — ИИ-подбор песен под ближайшую программу. */
export async function postServicePlanSongPick(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    const body = (req.body ?? {}) as {
      plan_id?: unknown;
      mode?: unknown;
      exclude_song_ids?: unknown;
      variation_seed?: unknown;
    };
    const planIdRaw = body.plan_id;
    const planId =
      planIdRaw == null
        ? undefined
        : Number.isInteger(Number(planIdRaw)) && Number(planIdRaw) > 0
          ? Number(planIdRaw)
          : null;
    if (planIdRaw != null && planId === null) {
      res.status(400).json({ error: 'Некорректный plan_id' });
      return;
    }

    const result = await pickSongsForNearestServicePlan({
      planId: planId ?? undefined,
      mode: body.mode,
      excludeSongIds: body.exclude_song_ids,
      variationSeed: body.variation_seed,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof SongPickAiError) {
      const mapped = mapStudioAiError(e, 'ИИ недоступен');
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
    }
    const msg = e instanceof Error ? e.message : 'Не удалось подобрать песни';
    const status = /не найден|нет предстоящ|заполните|нет музыкальных|нет опубликованных/i.test(msg) ? 400 : 500;
    console.error('[studio] service-plan-song-pick error:', e);
    res.status(status).json({ error: msg });
  }
}

/** POST /api/studio/service-plan-song-pick/apply — записать подобранные песни в блоки программы. */
export async function postServicePlanSongPickApply(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    const body = (req.body ?? {}) as {
      plan_id?: unknown;
      assignments?: unknown;
    };
    const planId = Number(body.plan_id);
    if (!Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: 'Нужен plan_id' });
      return;
    }
    const raw = Array.isArray(body.assignments) ? body.assignments : [];
    const assignments: Array<{ block_id: number; song_id: number }> = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const block_id = Number((item as { block_id?: unknown }).block_id);
      const song_id = Number((item as { song_id?: unknown }).song_id);
      if (Number.isInteger(block_id) && block_id > 0 && Number.isInteger(song_id) && song_id > 0) {
        assignments.push({ block_id, song_id });
      }
    }
    if (!assignments.length) {
      res.status(400).json({ error: 'Нужен непустой assignments: [{ block_id, song_id }]' });
      return;
    }

    const result = await applyServicePlanSongPicks(r.authUserId!, planId, assignments);
    res.json(result);
  } catch (e) {
    console.error('[studio] service-plan-song-pick apply error:', e);
    res.status(500).json({ error: 'Не удалось применить подбор' });
  }
}

/** GET /api/studio/service-plan-song-usage — аналитика песен из программ служений. */
export async function servicePlanSongUsage(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    const raw = req.query.months;
    let periodMonths: number | null = 12;
    if (raw === 'all' || raw === '0') {
      periodMonths = null;
    } else if (typeof raw === 'string') {
      const n = Number(raw);
      if (Number.isInteger(n) && n > 0 && n <= 120) periodMonths = n;
    }

    res.json(await getServicePlanSongUsageReport(periodMonths));
  } catch (e) {
    console.error('[studio] service-plan-song-usage error:', e);
    const detail = e instanceof Error ? e.message : 'Не удалось загрузить аналитику';
    res.status(500).json({ error: detail });
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

/** GET /api/studio/imported-songs — песочница импорта (только доступ к студии; все авторы, не фильтр по создателю). */
export async function importedSongsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    const songs = await listImportedSandboxSongsForStudio(r.authUserId!);
    res.json(songs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось загрузить импортированные песни' });
  }
}

/** GET /api/studio/public-catalog-sync-status — сколько песен ещё не в общем песеннике. */
export async function publicCatalogSyncStatus(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const hidden = await countMemberSongsHiddenFromPublicCatalog(r.authUserId!);
    const payload: { hidden: number; hiddenInProject?: number } = { hidden };
    if (sessionCanModerateCatalog(r)) {
      payload.hiddenInProject = await countSongsHiddenFromPublicCatalog();
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

/** POST /api/studio/sync-to-public-catalog — вынести готовые песни в общий песенник. */
export async function syncToPublicCatalog(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const body = req.body as { scope?: string } | undefined;
    const scope = String(body?.scope ?? req.query.scope ?? 'mine');
    const result =
      scope === 'project' && sessionCanModerateCatalog(r)
        ? await syncAllSongsToPublicCatalog()
        : await syncMemberSongsToPublicCatalog(r.authUserId!);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось синхронизировать каталог' });
  }
}

/** GET /api/studio/catalog-song/:songId — карточка песни для редактора (обязательный вход + доступ к студии). */
export async function catalogSongGet(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    const songId = Number(req.params.songId);
    if (!Number.isInteger(songId) || songId <= 0) {
      res.status(400).json({ error: 'Invalid songId' });
      return;
    }

    const studioCatalog =
      sessionCanModerateCatalog(r) ||
      sessionCanAccessStudio(r) ||
      (await hasMusicMinistryDirection(r.authUserId!));

    const visibility = {
      canModerateCatalog: sessionCanModerateCatalog(r),
      canAccessStudioCatalog: studioCatalog,
    };

    const song = await getSongById(songId, r.authUserId!, visibility);
    if (!song) {
      const imported = await listImportedSandboxSongsForStudio(r.authUserId!);
      const hit = imported.find((x) => Number(x.id) === songId);
      if (hit) {
        res.json(hit);
        return;
      }
      res.status(404).json({ error: 'Не найдено' });
      return;
    }
    res.json(song);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function setlistsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    res.json(await listSetlists(r.authUserId!, { includeAllPlanner: studioIncludeAllPlanner(r) }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

function isValidYmd(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
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
    let eventDate: string | null = null;
    if (body.event_date !== null && body.event_date !== undefined) {
      const raw = String(body.event_date).trim();
      const ymd = raw.slice(0, 10);
      if (!isValidYmd(ymd)) {
        res.status(400).json({ error: 'Field "event_date" must be YYYY-MM-DD' });
        return;
      }
      eventDate = ymd;
    }
    res.status(201).json(await createSetlist(r.authUserId!, title, eventDate));
  } catch (e) {
    console.error('[studio] setlistsCreate:', e);
    const detail = e instanceof Error ? e.message : 'Ошибка';
    res.status(500).json({ error: `Не удалось создать сетлист: ${detail}` });
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
    let nextEventDate: string | null | undefined = undefined;
    if (body.event_date !== undefined) {
      if (body.event_date === null) {
        nextEventDate = null;
      } else {
        const raw = String(body.event_date).trim();
        const ymd = raw.slice(0, 10);
        if (!isValidYmd(ymd)) {
          res.status(400).json({ error: 'Field "event_date" must be YYYY-MM-DD' });
          return;
        }
        nextEventDate = ymd;
      }
    }
    const updated = await updateSetlist(r.authUserId!, id, {
      title: body.title,
      event_date: nextEventDate,
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
    res.json(
      await listSetlistItems(r.authUserId!, setlistId, {
        includeAllPlanner: studioIncludeAllPlanner(r),
      }),
    );
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
    const payload = await getPerformancePayload(r.authUserId!, setlistId, {
      includeAllPlanner: studioIncludeAllPlanner(r),
    });
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

function mapStudioAiError(e: unknown, fallback: string): { status: number; body: Record<string, unknown> } | null {
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
    return {
      status,
      body: {
        error: e.message,
        code: e.code,
        details: e.bodySnippet ? { bodySnippet: e.bodySnippet } : undefined,
      },
    };
  }
  if (e instanceof Error && e.message) {
    const isValidation = /слишком большой|пустой ответ/i.test(e.message);
    return { status: isValidation ? 400 : 422, body: { error: e.message } };
  }
  return { status: 422, body: { error: fallback } };
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
    const mapped = mapStudioAiError(e, 'Не удалось расставить аккорды');
    if (mapped) {
      res.status(mapped.status).json(mapped.body);
      return;
    }
    res.status(422).json({ error: 'Не удалось расставить аккорды' });
  }
}

/** ИИ: привести текст песни в порядок (аккорды, секции, убрать мусор и источники). */
export async function postAiSongCleanup(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;

    const body = req.body as { content?: unknown } | null;
    const content = typeof body?.content === 'string' ? body.content : '';
    if (!content.trim()) {
      res.status(400).json({ error: 'Добавьте текст песни перед очисткой' });
      return;
    }

    const out = await cleanupSongWithAi(content);
    res.json(out);
  } catch (e) {
    const mapped = mapStudioAiError(e, 'Не удалось привести текст в порядок');
    if (mapped) {
      res.status(mapped.status).json(mapped.body);
      return;
    }
    console.error('[studio] ai song-cleanup error', e);
    res.status(500).json({ error: 'Не удалось привести текст в порядок' });
  }
}

export async function songTagsList(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    res.json(await listStudioSongTags());
  } catch (e) {
    console.error('[studio] songTagsList failed:', e);
    res.status(500).json({ error: 'Не удалось загрузить теги' });
  }
}

export async function songTagsCreate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    if (!sessionCanModerateCatalog(r)) {
      res.status(403).json({ error: 'Недостаточно прав для управления тегами' });
      return;
    }
    const body = req.body as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    try {
      const tag = await createStudioSongTag(name, r.authUserId ?? null);
      res.status(201).json(tag);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'invalid_name') {
        res.status(400).json({ error: 'Укажите корректное название тега (до 80 символов)' });
        return;
      }
      if (err.code === 'duplicate') {
        res.status(409).json({ error: 'Такой тег уже есть' });
        return;
      }
      throw e;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось создать тег' });
  }
}

export async function songTagsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    if (!sessionCanModerateCatalog(r)) {
      res.status(403).json({ error: 'Недостаточно прав для управления тегами' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    try {
      const tag = await renameStudioSongTag(id, name);
      if (!tag) {
        res.status(404).json({ error: 'Тег не найден' });
        return;
      }
      res.json(tag);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'invalid_name') {
        res.status(400).json({ error: 'Укажите корректное название тега (до 80 символов)' });
        return;
      }
      if (err.code === 'duplicate') {
        res.status(409).json({ error: 'Такой тег уже есть' });
        return;
      }
      throw e;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось обновить тег' });
  }
}

export async function songTagsDelete(req: Request, res: Response): Promise<void> {
  try {
    const r = req as AuthReq;
    if (!(await ensureStudio(r, res))) return;
    if (!sessionCanModerateCatalog(r)) {
      res.status(403).json({ error: 'Недостаточно прав для управления тегами' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const removeFromSongsRaw = req.query.removeFromSongs;
    const removeFromSongs =
      removeFromSongsRaw === '1' ||
      removeFromSongsRaw === 'true' ||
      (req.body as { removeFromSongs?: unknown } | null)?.removeFromSongs === true;
    const result = await deleteStudioSongTag(id, removeFromSongs);
    if (!result) {
      res.status(404).json({ error: 'Тег не найден' });
      return;
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось удалить тег' });
  }
}
