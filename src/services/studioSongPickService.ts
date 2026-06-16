import { AiAgentError, chatCompletion } from '../ai';
import { query } from '../config/db';
import { getPlanDetails, markServicePlanLastEdited, patchBlock } from './servicePlannerService';

type CatalogSong = {
  id: number;
  title: string;
  song_number: number | null;
  default_key: string | null;
  tags: string[];
  excerpt: string;
};

type SongBlockSlot = {
  block_id: number;
  order_index: number;
  title: string;
  current_song_id: number | null;
  current_song_title: string | null;
};

export type ServicePlanSongPickResult = {
  plan: {
    id: number;
    service_date: string;
    start_time: string;
    template_name: string | null;
    status: string;
  };
  sermon: {
    topic: string;
    scripture: string;
    preacher_name: string | null;
  };
  song_blocks: SongBlockSlot[];
  picks: Array<{
    block_id: number;
    order_index: number;
    song_id: number;
    song_title: string;
    song_number: number | null;
    default_key: string | null;
    reason: string;
  }>;
  ai_summary: string;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripChordPro(text: string): string {
  return text
    .replace(/\{sec:[^}]+\}/gi, ' ')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptFromContent(content: string, maxLen = 320): string {
  const plain = stripChordPro(content);
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).trim()}…`;
}

function isSongBlockCode(code: string | null | undefined): boolean {
  const c = String(code ?? '').toLowerCase();
  return c === 'song';
}

function parseAiJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\n?/u, '').replace(/\n?```$/u, '').trim()
    : trimmed;
  return JSON.parse(unfenced) as T;
}

async function findNearestUpcomingPlanId(): Promise<number | null> {
  const res = await query(
    `SELECT p.id
     FROM public.service_plans p
     WHERE coalesce(p.is_archived, false) = false
       AND p.service_date >= CURRENT_DATE
     ORDER BY p.service_date ASC, p.start_time ASC NULLS LAST, p.id ASC
     LIMIT 1`,
  );
  const id = (res.rows[0] as { id?: unknown } | undefined)?.id;
  return id != null ? Number(id) : null;
}

async function loadPlanContext(planId: number): Promise<{
  plan: ServicePlanSongPickResult['plan'];
  sermon: ServicePlanSongPickResult['sermon'];
  songBlocks: SongBlockSlot[];
}> {
  const details = await getPlanDetails(planId);
  if (!details) {
    throw new Error('Программа служения не найдена');
  }

  const blocksRes = await query(
    `SELECT
       b.id,
       b.order_index,
       b.title,
       b.song_id,
       b.content_json,
       bt.code AS block_type_code,
       s.title AS song_title,
       coalesce(
         nullif(trim(concat(coalesce(preacher.first_name, ''), ' ', coalesce(preacher.last_name, ''))), ''),
         preacher.name
       ) AS preacher_name
     FROM public.service_blocks b
     LEFT JOIN public.block_types bt ON bt.id = b.block_type_id
     LEFT JOIN public.songs s ON s.id = b.song_id
     LEFT JOIN public.service_plans p ON p.id = b.service_plan_id
     LEFT JOIN public.members preacher ON preacher.id = p.preacher_member_id
     WHERE b.service_plan_id = $1
     ORDER BY b.order_index ASC, b.id ASC`,
    [planId],
  );

  let sermonTopic = '';
  let sermonScripture = '';
  let preacherName: string | null = null;

  const songBlocks: SongBlockSlot[] = [];

  for (const row of blocksRes.rows) {
    const r = row as Record<string, unknown>;
    const code = r.block_type_code == null ? null : String(r.block_type_code);
    const content = (r.content_json ?? {}) as Record<string, unknown>;

    if (code === 'sermon' || String(r.title ?? '').toLowerCase().includes('проповед')) {
      const topic = typeof content.sermon_topic === 'string' ? content.sermon_topic.trim() : '';
      const scripture = typeof content.sermon_scripture === 'string' ? content.sermon_scripture.trim() : '';
      if (topic) sermonTopic = topic;
      if (scripture) sermonScripture = scripture;
      if (r.preacher_name && String(r.preacher_name).trim()) {
        preacherName = String(r.preacher_name).trim();
      }
    }

    if (isSongBlockCode(code)) {
      songBlocks.push({
        block_id: Number(r.id),
        order_index: Number(r.order_index ?? 0),
        title: String(r.title ?? 'Песня'),
        current_song_id: r.song_id == null ? null : Number(r.song_id),
        current_song_title: r.song_title == null ? null : String(r.song_title),
      });
    }
  }

  return {
    plan: {
      id: details.id,
      service_date: details.service_date,
      start_time: details.start_time,
      template_name: details.template_name,
      status: details.status,
    },
    sermon: {
      topic: sermonTopic,
      scripture: sermonScripture,
      preacher_name: preacherName,
    },
    songBlocks,
  };
}

async function loadPublishedCatalogForAi(sermonTopic: string, sermonScripture: string): Promise<CatalogSong[]> {
  const searchText = `${sermonTopic} ${sermonScripture}`.trim();

  const baseSelect = `
    SELECT
      s.id,
      s.title,
      s.song_number,
      s.default_key,
      s.tags,
      s.content
    FROM public.songs s
    WHERE s.is_published = TRUE
  `;

  let rows: Record<string, unknown>[] = [];

  if (searchText.length >= 2) {
    const filtered = await query(
      `${baseSelect}
       AND to_tsvector('simple', coalesce(s.title, '') || ' ' || coalesce(s.content, '') || ' ' || coalesce(array_to_string(s.tags, ' '), ''))
           @@ plainto_tsquery('simple', $1)
       ORDER BY COALESCE(s.song_number, 2147483647) ASC, s.title ASC
       LIMIT 220`,
      [searchText],
    );
    rows = filtered.rows as Record<string, unknown>[];
  }

  if (rows.length < 40) {
    const all = await query(
      `${baseSelect}
       ORDER BY COALESCE(s.song_number, 2147483647) ASC, s.title ASC
       LIMIT 280`,
    );
    const seen = new Set(rows.map((r) => Number(r.id)));
    for (const row of all.rows as Record<string, unknown>[]) {
      const id = Number(row.id);
      if (!seen.has(id)) {
        rows.push(row);
        seen.add(id);
      }
      if (rows.length >= 280) break;
    }
  }

  return rows.map((row) => {
    const tagsRaw = row.tags;
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map((t) => String(t)) : [];
    return {
      id: Number(row.id),
      title: String(row.title ?? ''),
      song_number: row.song_number == null ? null : Number(row.song_number),
      default_key: row.default_key == null ? null : String(row.default_key),
      tags,
      excerpt: excerptFromContent(String(row.content ?? '')),
    };
  });
}

async function loadRecentUsageHints(limit = 12): Promise<string[]> {
  const res = await query(
    `SELECT s.title, count(*)::int AS cnt
     FROM public.service_blocks b
     INNER JOIN public.block_types bt ON bt.id = b.block_type_id
     INNER JOIN public.service_plans sp ON sp.id = b.service_plan_id
     INNER JOIN public.songs s ON s.id = b.song_id
     WHERE lower(coalesce(bt.code, '')) = 'song'
       AND b.song_id IS NOT NULL
       AND coalesce(sp.is_archived, false) = false
       AND sp.service_date >= (CURRENT_DATE - interval '6 months')
     GROUP BY s.id, s.title
     ORDER BY cnt DESC, max(sp.service_date) DESC
     LIMIT $1`,
    [limit],
  );
  return res.rows.map((row) => {
    const r = row as { title?: string; cnt?: number };
    return `${String(r.title ?? '')} (${Number(r.cnt ?? 0)}×)`;
  });
}

const PICK_SYSTEM_PROMPT = [
  'Ты музыкальный руководитель протестантской церкви. Подбери песни для богослужения по теме проповеди.',
  '',
  'Ответ — ТОЛЬКО JSON без Markdown:',
  '{',
  '  "summary": "краткое объяснение подбора (1-3 предложения)",',
  '  "picks": [',
  '    { "block_id": number, "song_id": number, "reason": "почему эта песня подходит (1 предложение)" }',
  '  ]',
  '}',
  '',
  'Правила:',
  '— В picks ровно столько элементов, сколько слотов song_blocks (по одному на каждый block_id).',
  '— Используй только song_id из переданного каталога.',
  '— Не повторяй одну и ту же песню в разных слотах, если в каталоге достаточно вариантов.',
  '— Учитывай тему проповеди и место Писания; песни должны дополнять проповедь (поклонение, отклик, надежда).',
  '— Распредели разнообразие: если слотов несколько, чередуй динамику (тихая/радостная) по смыслу программы.',
  '— Слегка учитывай «недавно часто пели», но тема проповеди важнее.',
].join('\n');

export async function pickSongsForNearestServicePlan(planId?: number): Promise<ServicePlanSongPickResult> {
  const targetPlanId = planId ?? (await findNearestUpcomingPlanId());
  if (!targetPlanId) {
    throw new Error(
      `Нет предстоящей программы служения (начиная с ${todayYmd()}). Создайте план в планировщике.`,
    );
  }

  const ctx = await loadPlanContext(targetPlanId);

  if (ctx.songBlocks.length === 0) {
    throw new Error('В программе нет музыкальных блоков «Песня». Добавьте их в планировщике.');
  }

  if (!ctx.sermon.topic && !ctx.sermon.scripture) {
    throw new Error(
      'Заполните тему и/или место Писания в блоке «Проповедь» ближайшей программы — без этого ИИ не сможет подобрать песни.',
    );
  }

  const catalog = await loadPublishedCatalogForAi(ctx.sermon.topic, ctx.sermon.scripture);
  if (catalog.length === 0) {
    throw new Error('В каталоге нет опубликованных песен для подбора.');
  }

  const recentHints = await loadRecentUsageHints();

  const userPayload = {
    service_date: ctx.plan.service_date,
    sermon: ctx.sermon,
    song_blocks: ctx.songBlocks,
    recently_often_used: recentHints,
    catalog: catalog.map((s) => ({
      id: s.id,
      title: s.title,
      song_number: s.song_number,
      default_key: s.default_key,
      tags: s.tags,
      excerpt: s.excerpt,
    })),
  };

  const reply = await chatCompletion(
    [
      { role: 'system', content: PICK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Подбери песни для программы:\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
    {
      section: 'studio',
      temperature: 0.35,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      skipSystemPrompt: true,
    },
  );

  type AiPick = { block_id?: number; song_id?: number; reason?: string };
  type AiResponse = { summary?: string; picks?: AiPick[] };

  let parsed: AiResponse;
  try {
    parsed = parseAiJson<AiResponse>(String(reply ?? '{}'));
  } catch {
    throw new Error('ИИ вернул некорректный JSON. Попробуйте ещё раз.');
  }

  const catalogById = new Map(catalog.map((s) => [s.id, s]));
  const blockById = new Map(ctx.songBlocks.map((b) => [b.block_id, b]));
  const expectedBlockIds = ctx.songBlocks.map((b) => b.block_id);

  const rawPicks = Array.isArray(parsed.picks) ? parsed.picks : [];
  const usedSongIds = new Set<number>();
  const validated: ServicePlanSongPickResult['picks'] = [];

  for (const blockId of expectedBlockIds) {
    const slot = blockById.get(blockId);
    if (!slot) continue;

    const match =
      rawPicks.find((p) => Number(p.block_id) === blockId) ??
      rawPicks.find((p) => {
        const sid = Number(p.song_id);
        return Number.isInteger(sid) && catalogById.has(sid) && !usedSongIds.has(sid);
      });

    const songId = Number(match?.song_id);
    const song = catalogById.get(songId);
    if (!song) {
      const fallback = catalog.find((s) => !usedSongIds.has(s.id));
      if (!fallback) {
        throw new Error('ИИ не смог подобрать уникальные песни для всех блоков.');
      }
      usedSongIds.add(fallback.id);
      validated.push({
        block_id: blockId,
        order_index: slot.order_index,
        song_id: fallback.id,
        song_title: fallback.title,
        song_number: fallback.song_number,
        default_key: fallback.default_key,
        reason: 'Запасной вариант из каталога (ИИ не указал подходящую песню для слота).',
      });
      continue;
    }

    usedSongIds.add(song.id);
    validated.push({
      block_id: blockId,
      order_index: slot.order_index,
      song_id: song.id,
      song_title: song.title,
      song_number: song.song_number,
      default_key: song.default_key,
      reason: String(match?.reason ?? '').trim() || 'Подобрано по теме проповеди.',
    });
  }

  return {
    plan: ctx.plan,
    sermon: ctx.sermon,
    song_blocks: ctx.songBlocks,
    picks: validated,
    ai_summary: String(parsed.summary ?? '').trim() || 'Подбор выполнен по теме проповеди и каталогу песен.',
  };
}

export async function applyServicePlanSongPicks(
  editorMemberId: number,
  planId: number,
  assignments: Array<{ block_id: number; song_id: number }>,
): Promise<{ applied: number }> {
  if (!assignments.length) return { applied: 0 };

  const ctx = await loadPlanContext(planId);
  const allowedBlockIds = new Set(ctx.songBlocks.map((b) => b.block_id));

  let applied = 0;
  for (const { block_id, song_id } of assignments) {
    if (!allowedBlockIds.has(block_id)) continue;
    if (!Number.isInteger(song_id) || song_id <= 0) continue;

    const songRes = await query(`SELECT id, title FROM public.songs WHERE id = $1 AND is_published = TRUE LIMIT 1`, [
      song_id,
    ]);
    if (!songRes.rows[0]) continue;

    const ok = await patchBlock(block_id, { song_id });
    if (ok) applied += 1;
  }

  if (applied > 0) {
    await markServicePlanLastEdited(planId, editorMemberId);
  }

  return { applied };
}

export { AiAgentError };
