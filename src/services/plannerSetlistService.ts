import { query } from '../config/db';
import { syncSongBlockAssigneesFromPlanMusicMinistry } from './servicePlannerService';
import { sendPush } from './pushService';

export interface PlannerSetlistSyncResult {
  setlistId: number;
  memberId: number;
  songCount: number;
  created: boolean;
  songsChanged: boolean;
}

interface PlanSongBlock {
  song_id: number;
  assigned_member_id: number | null;
}

function formatRuDateLong(ymd: string): string {
  const dt = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

function pluralSongs(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'песня';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'песни';
  return 'песен';
}

async function findStudioVersionId(memberId: number, songId: number): Promise<number | null> {
  const r = await query(
    `SELECT id FROM studio_versions
     WHERE member_id = $1 AND song_id = $2
       AND btrim(coalesce(custom_content, '')) <> ''
     ORDER BY updated_at DESC
     LIMIT 1`,
    [memberId, songId],
  );
  const id = r.rows[0]?.id;
  return id != null ? Number(id) : null;
}

/** Песни из блоков «Песня» в порядке программы + ответственный на блоке. */
async function fetchPlanSongBlocks(planId: number): Promise<PlanSongBlock[]> {
  const blocksRes = await query(
    `SELECT b.song_id, b.assigned_member_id
     FROM public.service_blocks b
     INNER JOIN public.block_types bt ON bt.id = b.block_type_id
     WHERE b.service_plan_id = $1
       AND (lower(coalesce(bt.code, '')) = 'song' OR bt.kind = 'song')
       AND b.song_id IS NOT NULL
     ORDER BY b.order_index ASC, b.id ASC`,
    [planId],
  );
  const blocks: PlanSongBlock[] = [];
  for (const row of blocksRes.rows) {
    const songId = Number((row as { song_id?: unknown }).song_id);
    if (!Number.isInteger(songId) || songId <= 0) continue;
    const assigned =
      (row as { assigned_member_id?: unknown }).assigned_member_id == null
        ? null
        : Number((row as { assigned_member_id?: unknown }).assigned_member_id);
    blocks.push({
      song_id: songId,
      assigned_member_id:
        assigned != null && Number.isInteger(assigned) && assigned > 0 ? assigned : null,
    });
  }
  return blocks;
}

/**
 * Группирует песни по ответственному музыканту (assigned_member_id на блоке).
 * Если на блоке не указан — подставляется music_ministry_member_id плана.
 */
function groupSongsByResponsibleMusician(
  blocks: PlanSongBlock[],
  planMusicMinistryId: number | null,
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const block of blocks) {
    const musicianId = block.assigned_member_id ?? planMusicMinistryId;
    if (musicianId == null || musicianId <= 0) continue;
    const list = groups.get(musicianId) ?? [];
    if (!list.includes(block.song_id)) {
      list.push(block.song_id);
    }
    groups.set(musicianId, list);
  }
  return groups;
}

async function fetchExistingSetlistItemSongIds(setlistId: number): Promise<number[]> {
  const r = await query(
    `SELECT song_id FROM setlist_items WHERE setlist_id = $1 ORDER BY position ASC`,
    [setlistId],
  );
  return r.rows.map((row) => Number((row as { song_id?: unknown }).song_id));
}

async function replaceSetlistItems(
  setlistId: number,
  memberId: number,
  songIds: number[],
): Promise<void> {
  await query(`DELETE FROM setlist_items WHERE setlist_id = $1`, [setlistId]);
  for (let i = 0; i < songIds.length; i += 1) {
    const songId = songIds[i]!;
    const studioVersionId = await findStudioVersionId(memberId, songId);
    await query(
      `INSERT INTO setlist_items (setlist_id, position, song_id, studio_version_id)
       VALUES ($1, $2, $3, $4)`,
      [setlistId, i, songId, studioVersionId],
    );
  }
}

async function upsertSetlistForMusician(input: {
  planId: number;
  memberId: number;
  songIds: number[];
  title: string;
  serviceDate: string;
}): Promise<PlannerSetlistSyncResult> {
  const existingRes = await query(
    `SELECT id FROM setlists
     WHERE source_service_plan_id = $1 AND member_id = $2
     LIMIT 1`,
    [input.planId, input.memberId],
  );
  const existingId = existingRes.rows[0]?.id != null ? Number(existingRes.rows[0].id) : null;

  let setlistId: number;
  let created = false;

  if (existingId) {
    setlistId = existingId;
    await query(
      `UPDATE setlists
       SET title = $2,
           event_date = $3::date,
           is_public = TRUE,
           share_token_issued_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [setlistId, input.title, input.serviceDate || null],
    );
  } else {
    const ins = await query(
      `INSERT INTO setlists (
         member_id, title, event_date, source_service_plan_id,
         is_public, share_token_issued_at, updated_at
       )
       VALUES ($1, $2, $3::date, $4, TRUE, NOW(), NOW())
       RETURNING id`,
      [input.memberId, input.title, input.serviceDate || null, input.planId],
    );
    setlistId = Number(ins.rows[0]!.id);
    created = true;
  }

  const previousSongIds = existingId ? await fetchExistingSetlistItemSongIds(setlistId) : [];
  const songsChanged =
    created ||
    previousSongIds.length !== input.songIds.length ||
    previousSongIds.some((id, idx) => id !== input.songIds[idx]);

  if (songsChanged) {
    await replaceSetlistItems(setlistId, input.memberId, input.songIds);
  }

  return {
    setlistId,
    memberId: input.memberId,
    songCount: input.songIds.length,
    created,
    songsChanged,
  };
}

async function removeOrphanPlannerSetlists(planId: number, activeMemberIds: number[]): Promise<void> {
  if (activeMemberIds.length === 0) {
    await query(`DELETE FROM setlists WHERE source_service_plan_id = $1`, [planId]);
    return;
  }
  await query(
    `DELETE FROM setlists
     WHERE source_service_plan_id = $1
       AND NOT (member_id = ANY($2::int[]))`,
    [planId, activeMemberIds],
  );
}

/**
 * Создаёт или обновляет сетлисты для ответственных музыкантов из опубликованной программы.
 * Музыкант определяется по assigned_member_id на блоках «Песня» (не по полю плана в целом).
 */
export async function syncSetlistFromPublishedPlan(
  planId: number,
): Promise<PlannerSetlistSyncResult[]> {
  const planRes = await query(
    `SELECT
       p.id,
       p.status,
       p.service_date::text AS service_date,
       p.music_ministry_member_id,
       coalesce(nullif(trim(t.name), ''), 'Служение') AS template_name
     FROM public.service_plans p
     LEFT JOIN public.service_templates t ON t.id = p.template_id
     WHERE p.id = $1
     LIMIT 1`,
    [planId],
  );
  const plan = planRes.rows[0] as
    | {
        status?: string;
        service_date?: string;
        music_ministry_member_id?: number | null;
        template_name?: string;
      }
    | undefined;
  if (!plan || plan.status !== 'published') return [];

  await syncSongBlockAssigneesFromPlanMusicMinistry(planId);

  const planMusicMinistryId =
    plan.music_ministry_member_id == null ? null : Number(plan.music_ministry_member_id);

  const songBlocks = await fetchPlanSongBlocks(planId);
  const groups = groupSongsByResponsibleMusician(songBlocks, planMusicMinistryId);
  if (groups.size === 0) {
    console.warn('[planner-setlist] skip: no responsible musician or songs', {
      planId,
      songBlockCount: songBlocks.length,
      musicMinistryMemberId: planMusicMinistryId,
    });
    return [];
  }

  const serviceDate = String(plan.service_date ?? '').trim();
  const dateLabel = serviceDate ? formatRuDateLong(serviceDate) : 'ближайшее служение';
  const title = `${String(plan.template_name ?? 'Служение').trim()} · ${dateLabel}`;

  const results: PlannerSetlistSyncResult[] = [];
  const activeMemberIds: number[] = [];

  for (const [memberId, songIds] of groups) {
    if (songIds.length === 0) continue;
    activeMemberIds.push(memberId);
    results.push(
      await upsertSetlistForMusician({
        planId,
        memberId,
        songIds,
        title,
        serviceDate,
      }),
    );
  }

  await removeOrphanPlannerSetlists(planId, activeMemberIds);
  return results;
}

export async function notifyMusicianSetlistReady(input: {
  memberId: number;
  setlistId: number;
  serviceDate: string;
  songCount: number;
  planId: number;
}): Promise<void> {
  const dateText = input.serviceDate ? formatRuDateLong(input.serviceDate) : 'служение';
  const count = input.songCount;
  await sendPush(
    input.memberId,
    'Сетлист готов к служению',
    `Программа на ${dateText} опубликована — ${count} ${pluralSongs(count)}. Откройте сетлист и отправьте ссылку команде.`,
    {
      url: `/songbook/setlists/${input.setlistId}?welcome=planner`,
      type: 'planner_setlist_ready',
      setlist_id: String(input.setlistId),
      service_plan_id: String(input.planId),
      tag: `planner-setlist-${input.planId}-${input.memberId}`,
    },
  );
}

/**
 * Синхронизирует сетлисты и уведомляет каждого ответственного музыканта.
 * Уведомление — при публикации, если сетлист создан или список песен изменился.
 */
export async function syncAndNotifySetlistFromPublishedPlan(
  planId: number,
  opts?: { notifyOnPublish?: boolean },
): Promise<void> {
  try {
    const results = await syncSetlistFromPublishedPlan(planId);
    if (results.length === 0) return;

    const planRes = await query(
      `SELECT service_date::text AS service_date FROM public.service_plans WHERE id = $1 LIMIT 1`,
      [planId],
    );
    const serviceDate = String(planRes.rows[0]?.service_date ?? '');

    for (const result of results) {
      const shouldNotify =
        Boolean(opts?.notifyOnPublish) && (result.created || result.songsChanged);
      if (!shouldNotify) continue;

      await notifyMusicianSetlistReady({
        memberId: result.memberId,
        setlistId: result.setlistId,
        serviceDate,
        songCount: result.songCount,
        planId,
      });
    }
  } catch (e) {
    console.error('[planner-setlist] syncAndNotify failed:', e);
  }
}
