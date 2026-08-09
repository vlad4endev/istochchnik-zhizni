import { AiAgentError, chatCompletion } from '../ai';
import { query } from '../config/db';
import { getPlanDetails, markServicePlanLastEdited, patchBlock } from './servicePlannerService';
import {
  buildVariationSeed,
  inferSlotRole,
  modePolicy,
  normalizeExcludeSongIds,
  pickAlternativesForSong,
  rankCatalogForPick,
  resolvePickMode,
  roleHintRu,
  type CatalogSongBase,
  type RankedCatalogSong,
  type SongPickMode,
  type SongUsageStats,
} from './studioSongPickHelpers';

type SongBlockSlot = {
  block_id: number;
  order_index: number;
  title: string;
  role: ReturnType<typeof inferSlotRole>;
  role_hint: string;
  current_song_id: number | null;
  current_song_title: string | null;
};

export type ServicePlanSongPickAlternative = {
  song_id: number;
  song_title: string;
  song_number: number | null;
  default_key: string | null;
  days_since_last_use: number | null;
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
    tempo: number | null;
    reason: string;
    days_since_last_use: number | null;
    usage_count_6m: number;
    alternatives: ServicePlanSongPickAlternative[];
  }>;
  ai_summary: string;
  meta: {
    mode: SongPickMode;
    mode_label: string;
    variation_seed: string;
    hard_cooldown_days: number;
    catalog_size: number;
    avoided_recent_count: number;
  };
};

export type ServicePlanSongPickOptions = {
  planId?: number;
  mode?: unknown;
  excludeSongIds?: unknown;
  variationSeed?: unknown;
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

function excerptFromContent(content: string, maxLen = 280): string {
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
      const title = String(r.title ?? 'Песня');
      const role = inferSlotRole(title);
      songBlocks.push({
        block_id: Number(r.id),
        order_index: Number(r.order_index ?? 0),
        title,
        role,
        role_hint: roleHintRu(role),
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

function mapCatalogRow(row: Record<string, unknown>, relevance: number): CatalogSongBase {
  const tagsRaw = row.tags;
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map((t) => String(t)) : [];
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    song_number: row.song_number == null ? null : Number(row.song_number),
    default_key: row.default_key == null ? null : String(row.default_key),
    tempo: row.tempo == null || !Number.isFinite(Number(row.tempo)) ? null : Number(row.tempo),
    tags,
    excerpt: excerptFromContent(String(row.content ?? '')),
    relevance,
  };
}

/**
 * Каталог: сначала тематический FTS с ts_rank, затем fill из остальных.
 * Не сортируем по song_number — это делало подбор «деревянным».
 */
async function loadPublishedCatalogForAi(sermonTopic: string, sermonScripture: string): Promise<CatalogSongBase[]> {
  const searchText = `${sermonTopic} ${sermonScripture}`.trim();

  const baseSelect = `
    SELECT
      s.id,
      s.title,
      s.song_number,
      s.default_key,
      s.tempo,
      s.tags,
      s.content
    FROM public.songs s
    WHERE s.is_published = TRUE
      AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
      AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
  `;

  const byId = new Map<number, CatalogSongBase>();

  if (searchText.length >= 2) {
    const filtered = await query(
      `${baseSelect}
       AND to_tsvector('simple', coalesce(s.title, '') || ' ' || coalesce(s.content, '') || ' ' || coalesce(array_to_string(s.tags, ' '), ''))
           @@ plainto_tsquery('simple', $1)
       ORDER BY ts_rank(
         to_tsvector('simple', coalesce(s.title, '') || ' ' || coalesce(s.content, '') || ' ' || coalesce(array_to_string(s.tags, ' '), '')),
         plainto_tsquery('simple', $1)
       ) DESC,
       s.title ASC
       LIMIT 200`,
      [searchText],
    );
    let rankPos = 0;
    for (const row of filtered.rows as Record<string, unknown>[]) {
      rankPos += 1;
      // Нормализуем позицию в 0.35..1.0 — даже нижние FTS-хиты лучше fill
      const relevance = Math.max(0.35, 1 - (rankPos - 1) / 200);
      const song = mapCatalogRow(row, relevance);
      byId.set(song.id, song);
    }
  }

  if (byId.size < 50) {
    const all = await query(
      `${baseSelect}
       ORDER BY s.updated_at DESC NULLS LAST, s.id DESC
       LIMIT 320`,
    );
    for (const row of all.rows as Record<string, unknown>[]) {
      const id = Number((row as { id?: unknown }).id);
      if (byId.has(id)) continue;
      // Fill: слабая «релевантность», чтобы ranking опирался на свежесть
      byId.set(id, mapCatalogRow(row, 0.12));
      if (byId.size >= 280) break;
    }
  }

  return [...byId.values()];
}

async function loadUsageStats(songIds: number[]): Promise<Map<number, SongUsageStats>> {
  const map = new Map<number, SongUsageStats>();
  if (!songIds.length) return map;

  for (const id of songIds) {
    map.set(id, {
      song_id: id,
      usage_count_6m: 0,
      last_used_date: null,
      days_since_last_use: null,
    });
  }

  const res = await query(
    `SELECT
       b.song_id,
       count(*) FILTER (WHERE sp.service_date >= (CURRENT_DATE - interval '6 months'))::int AS usage_count_6m,
       max(sp.service_date)::text AS last_used_date,
       CASE
         WHEN max(sp.service_date) IS NULL THEN NULL
         ELSE (CURRENT_DATE - max(sp.service_date))::int
       END AS days_since_last_use
     FROM public.service_blocks b
     INNER JOIN public.block_types bt ON bt.id = b.block_type_id
     INNER JOIN public.service_plans sp ON sp.id = b.service_plan_id
     WHERE lower(coalesce(bt.code, '')) = 'song'
       AND b.song_id = ANY($1::int[])
     GROUP BY b.song_id`,
    [songIds],
  );

  for (const row of res.rows as Record<string, unknown>[]) {
    const song_id = Number(row.song_id);
    map.set(song_id, {
      song_id,
      usage_count_6m: Number(row.usage_count_6m ?? 0),
      last_used_date: row.last_used_date == null ? null : String(row.last_used_date),
      days_since_last_use:
        row.days_since_last_use == null || !Number.isFinite(Number(row.days_since_last_use))
          ? null
          : Number(row.days_since_last_use),
    });
  }
  return map;
}

/** Песни, которые пели недавно — жёсткий cooldown для primary. */
async function loadRecentSongIds(cooldownDays: number): Promise<Set<number>> {
  if (cooldownDays <= 0) return new Set();
  const res = await query(
    `SELECT DISTINCT b.song_id
     FROM public.service_blocks b
     INNER JOIN public.block_types bt ON bt.id = b.block_type_id
     INNER JOIN public.service_plans sp ON sp.id = b.service_plan_id
     WHERE lower(coalesce(bt.code, '')) = 'song'
       AND b.song_id IS NOT NULL
       AND sp.service_date >= (CURRENT_DATE - $1::int)
       AND sp.service_date <= (CURRENT_DATE + 14)`,
    [cooldownDays],
  );
  return new Set(
    res.rows.map((row) => Number((row as { song_id?: unknown }).song_id)).filter((id) => Number.isInteger(id) && id > 0),
  );
}

/** Короткие подсказки для промпта: кого избегать и кого стоит «достать с полки». */
function buildUsagePromptHints(ranked: RankedCatalogSong[]): {
  avoid_recent: string[];
  underused_gems: string[];
} {
  const avoid_recent = ranked
    .filter((s) => s.on_cooldown || (s.days_since_last_use != null && s.days_since_last_use < 21))
    .slice(0, 18)
    .map((s) => {
      const days = s.days_since_last_use != null ? `${s.days_since_last_use}д назад` : 'недавно';
      return `${s.title} (${days}, ${s.usage_count_6m}×/6м)`;
    });

  const underused_gems = ranked
    .filter((s) => !s.on_cooldown && (s.days_since_last_use == null || s.days_since_last_use >= 45))
    .filter((s) => s.relevance >= 0.2 || s.usage_count_6m <= 1)
    .slice(0, 16)
    .map((s) => {
      const days =
        s.days_since_last_use == null ? 'давно/никогда' : `${s.days_since_last_use}д назад`;
      return `${s.title} [${s.id}] (${days})`;
    });

  return { avoid_recent, underused_gems };
}

const PICK_SYSTEM_PROMPT = [
  'Ты музыкальный руководитель протестантской церкви. Подбери песни для богослужения по теме проповеди.',
  '',
  'Ответ — ТОЛЬКО JSON без Markdown:',
  '{',
  '  "summary": "краткое объяснение подбора и литургической дуги (1-3 предложения)",',
  '  "picks": [',
  '    { "block_id": number, "song_id": number, "reason": "почему эта песня подходит именно этому слоту (1 предложение)" }',
  '  ]',
  '}',
  '',
  'Правила:',
  '— В picks ровно столько элементов, сколько слотов song_blocks (по одному на каждый block_id).',
  '— Используй только song_id из переданного catalog (поле id).',
  '— Не повторяй одну и ту же песню в разных слотах.',
  '— Учитывай тему проповеди и Писание; песни дополняют проповедь (поклонение, отклик, надежда).',
  '— Соблюдай литургическую дугу по role_hint слотов: opening → worship → response → closing.',
  '— Сильно избегай песен из avoid_recent (недавно пели) — бери их только если тема уникально требует и нет альтернатив.',
  '— Активно бери достойные песни из underused_gems, если они подходят по смыслу.',
  '— Не выбирай одни и те же «хиты» только потому что они популярны.',
  '— Чередуй динамику: не ставь подряд несколько тихих или несколько быстрых, если есть выбор.',
  '— Если в payload есть exclude_song_ids — не используй их вообще (пользователь просит другой вариант).',
  '— Каталог уже отсортирован по полезности для этого режима: чаще смотри на начало списка, но не игнорируй хвост при хорошем смысловом совпадении.',
].join('\n');

function catalogForPrompt(ranked: RankedCatalogSong[], limit = 160) {
  // В промпт — топ по score, без cooldown в приоритете (они уже внизу)
  return ranked.slice(0, limit).map((s) => ({
    id: s.id,
    title: s.title,
    song_number: s.song_number,
    default_key: s.default_key,
    tempo: s.tempo,
    tags: s.tags.slice(0, 8),
    days_since_last_use: s.days_since_last_use,
    on_cooldown: s.on_cooldown,
    excerpt: s.excerpt,
  }));
}

export async function pickSongsForNearestServicePlan(
  planIdOrOptions?: number | ServicePlanSongPickOptions,
): Promise<ServicePlanSongPickResult> {
  const options: ServicePlanSongPickOptions =
    typeof planIdOrOptions === 'number' || planIdOrOptions == null
      ? { planId: planIdOrOptions ?? undefined }
      : planIdOrOptions;

  const mode = resolvePickMode(options.mode);
  const policy = modePolicy(mode);
  const variationSeed = buildVariationSeed(options.variationSeed);
  const excludeSongIds = normalizeExcludeSongIds(options.excludeSongIds);
  const excludeSet = new Set(excludeSongIds);

  const targetPlanId = options.planId ?? (await findNearestUpcomingPlanId());
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

  const usageBySongId = await loadUsageStats(catalog.map((s) => s.id));
  const recentIds = await loadRecentSongIds(policy.hardCooldownDays);
  const hardAvoidIds = new Set<number>([...recentIds, ...excludeSet]);

  // Текущие песни в слотах — не «избегаем» жёстко при первом подборе,
  // но при regenerate (exclude) пользователь сам исключает предыдущий вариант.
  const ranked = rankCatalogForPick({
    catalog,
    usageBySongId,
    policy,
    seed: `${variationSeed}:${targetPlanId}:${mode}`,
    todayYmd: todayYmd(),
    hardAvoidIds,
  });

  const hints = buildUsagePromptHints(ranked);
  const primaryPool = ranked.filter((s) => !s.on_cooldown && !excludeSet.has(s.id));
  const fallbackPool = ranked.filter((s) => !excludeSet.has(s.id));

  const userPayload = {
    mode: policy.mode,
    mode_label: policy.labelRu,
    hard_cooldown_days: policy.hardCooldownDays,
    service_date: ctx.plan.service_date,
    sermon: ctx.sermon,
    song_blocks: ctx.songBlocks.map((b) => ({
      block_id: b.block_id,
      order_index: b.order_index,
      title: b.title,
      role: b.role,
      role_hint: b.role_hint,
      current_song_id: b.current_song_id,
      current_song_title: b.current_song_title,
    })),
    avoid_recent: hints.avoid_recent,
    underused_gems: hints.underused_gems,
    exclude_song_ids: excludeSongIds,
    catalog: catalogForPrompt(ranked),
  };

  const reply = await chatCompletion(
    [
      { role: 'system', content: PICK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Подбери песни для программы. Приоритет: соответствие теме проповеди + не повторять недавно певшиеся.\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
    {
      section: 'studio',
      temperature: policy.temperature,
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

  const catalogById = new Map(ranked.map((s) => [s.id, s]));
  const blockById = new Map(ctx.songBlocks.map((b) => [b.block_id, b]));
  const expectedBlockIds = ctx.songBlocks.map((b) => b.block_id);

  const rawPicks = Array.isArray(parsed.picks) ? parsed.picks : [];
  const usedSongIds = new Set<number>();
  const validated: ServicePlanSongPickResult['picks'] = [];

  const takeFallback = (preferFresh: boolean): RankedCatalogSong | undefined => {
    const pool = preferFresh && primaryPool.length ? primaryPool : fallbackPool;
    return pool.find((s) => !usedSongIds.has(s.id));
  };

  for (const blockId of expectedBlockIds) {
    const slot = blockById.get(blockId);
    if (!slot) continue;

    const match = rawPicks.find((p) => Number(p.block_id) === blockId);
    const candidateId = Number(match?.song_id);
    const candidate = catalogById.get(candidateId);
    let reason = String(match?.reason ?? '').trim();

    const invalid =
      !candidate ||
      usedSongIds.has(candidate.id) ||
      excludeSet.has(candidate.id) ||
      // Если есть выбор вне cooldown — не принимаем cooldown-хит от модели
      (candidate.on_cooldown && primaryPool.some((s) => !usedSongIds.has(s.id)));

    let song: RankedCatalogSong;
    if (invalid) {
      const fallback = takeFallback(true) ?? takeFallback(false);
      if (!fallback) {
        throw new Error('ИИ не смог подобрать уникальные песни для всех блоков.');
      }
      song = fallback;
      reason = reason
        ? `${reason} (заменён запасным вариантом из каталога).`
        : 'Запасной вариант из каталога с учётом ротации и темы.';
    } else {
      song = candidate;
    }

    usedSongIds.add(song.id);
    validated.push({
      block_id: blockId,
      order_index: slot.order_index,
      song_id: song.id,
      song_title: song.title,
      song_number: song.song_number,
      default_key: song.default_key,
      tempo: song.tempo,
      reason: reason || 'Подобрано по теме проповеди и литургической дуге.',
      days_since_last_use: song.days_since_last_use,
      usage_count_6m: song.usage_count_6m,
      alternatives: [],
    });
  }

  // Альтернативы после фиксации primary — чтобы не пересекаться с выбранным сетом
  const primaryIds = new Set(validated.map((p) => p.song_id));
  for (const pick of validated) {
    const alts = pickAlternativesForSong({
      primaryId: pick.song_id,
      ranked,
      usedIds: primaryIds,
      limit: 2,
    });
    for (const alt of alts) primaryIds.add(alt.id);
    pick.alternatives = alts.map((s) => ({
      song_id: s.id,
      song_title: s.title,
      song_number: s.song_number,
      default_key: s.default_key,
      days_since_last_use: s.days_since_last_use,
    }));
  }

  return {
    plan: ctx.plan,
    sermon: ctx.sermon,
    song_blocks: ctx.songBlocks,
    picks: validated,
    ai_summary:
      String(parsed.summary ?? '').trim() ||
      'Подбор по теме проповеди с ротацией недавно певшихся песен.',
    meta: {
      mode: policy.mode,
      mode_label: policy.labelRu,
      variation_seed: variationSeed,
      hard_cooldown_days: policy.hardCooldownDays,
      catalog_size: ranked.length,
      avoided_recent_count: recentIds.size,
    },
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
export type { SongPickMode };
