import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { findBookDefBySlug } from '../bible/bibleBookCatalog';

export interface BiblePlanDayInput {
  day: number;
  label?: string;
  refs: BiblePlanRef[];
}

export interface BiblePlanRef {
  book_slug: string;
  chapter: number;
  verse_start?: number;
  verse_end?: number;
}

export interface BiblePlanDayRow {
  id: number;
  plan_id: number;
  day_index: number;
  day_date: string | null;
  label: string;
  refs_json: BiblePlanRef[];
  completed_at: string | null;
}

export interface BiblePlanRow {
  id: number;
  member_id: number;
  title: string;
  goal: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  ai_prompt: string | null;
  created_at: string;
  updated_at: string;
  days_total?: number;
  days_completed?: number;
  days?: BiblePlanDayRow[];
}

function normalizeRefs(raw: unknown): BiblePlanRef[] {
  if (!Array.isArray(raw)) return [];
  const out: BiblePlanRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const bookSlug = typeof o.book_slug === 'string' ? o.book_slug : typeof o.book === 'string' ? o.book : '';
    const def = findBookDefBySlug(bookSlug);
    const chapter = Number(o.chapter);
    if (!def || !Number.isInteger(chapter) || chapter < 1 || chapter > def.chapters) continue;
    const verseStart = o.verse_start != null ? Number(o.verse_start) : o.verseStart != null ? Number(o.verseStart) : undefined;
    const verseEnd = o.verse_end != null ? Number(o.verse_end) : o.verseEnd != null ? Number(o.verseEnd) : undefined;
    out.push({
      book_slug: def.slug,
      chapter,
      ...(Number.isInteger(verseStart) && (verseStart as number) > 0 ? { verse_start: verseStart as number } : {}),
      ...(Number.isInteger(verseEnd) && (verseEnd as number) > 0 ? { verse_end: verseEnd as number } : {}),
    });
  }
  return out;
}

export function validateAiPlanPayload(raw: unknown): {
  title: string;
  days: BiblePlanDayInput[];
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'План чтения';
  if (!Array.isArray(o.days) || o.days.length === 0) return null;
  const days: BiblePlanDayInput[] = [];
  for (const d of o.days) {
    if (!d || typeof d !== 'object') continue;
    const dayObj = d as Record<string, unknown>;
    const day = Number(dayObj.day ?? dayObj.day_index);
    if (!Number.isInteger(day) || day < 1) continue;
    const refs = normalizeRefs(dayObj.refs);
    if (refs.length === 0) continue;
    const label = typeof dayObj.label === 'string' ? dayObj.label.trim() : undefined;
    days.push({ day, label, refs });
  }
  if (days.length === 0) return null;
  days.sort((a, b) => a.day - b.day);
  return { title, days };
}

/**
 * Размеры дней для равномерного распределения `total` отрывков по `n` дням:
 * размеры отличаются не более чем на 1, остаток уходит в ПЕРВЫЕ дни
 * (привычный формат читательских планов), а не сваливается в последний день.
 */
export function evenChunkSizes(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n) || 1);
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

function refSortKey(ref: BiblePlanRef): [number, number, number] {
  const def = findBookDefBySlug(ref.book_slug);
  return [def?.ord ?? 999, ref.chapter, ref.verse_start ?? 0];
}

/** Ссылки идут в каноническом порядке (неубывающе): книга → глава → стих. */
function isCanonicalSequence(refs: BiblePlanRef[]): boolean {
  for (let i = 1; i < refs.length; i += 1) {
    const [po, pc, pv] = refSortKey(refs[i - 1]!);
    const [o, c, v] = refSortKey(refs[i]!);
    if (o < po) return false;
    if (o === po && c < pc) return false;
    if (o === po && c === pc && v < pv) return false;
  }
  return true;
}

function shortBookName(slug: string): string {
  return findBookDefBySlug(slug)?.shortNameRu ?? slug;
}

/** Подпись дня по диапазону ссылок: «Мф 1–4», «Мк 16 — Лк 2», «Ин 3». */
export function buildPlanDayLabel(refs: BiblePlanRef[]): string {
  if (refs.length === 0) return '';
  const first = refs[0]!;
  const last = refs[refs.length - 1]!;
  const firstLabel = `${shortBookName(first.book_slug)} ${first.chapter}${
    first.verse_start != null ? `:${first.verse_start}` : ''
  }`;
  if (first.book_slug === last.book_slug) {
    if (first.chapter === last.chapter) return firstLabel;
    return `${shortBookName(first.book_slug)} ${first.chapter}–${last.chapter}`;
  }
  return `${firstLabel} — ${shortBookName(last.book_slug)} ${last.chapter}`;
}

function sameRefs(a: BiblePlanRef[], b: BiblePlanRef[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (r, i) =>
      r.book_slug === b[i]!.book_slug &&
      r.chapter === b[i]!.chapter &&
      r.verse_start === b[i]!.verse_start &&
      r.verse_end === b[i]!.verse_end,
  );
}

/**
 * Детерминированная перебалансировка дней плана после ответа ИИ.
 *
 * Модель часто делит «по N глав» и сваливает весь остаток в последний день
 * (89 глав / 25 дней → 24 дня по 3 и последний день из 14 глав).
 * Здесь, если ссылки образуют непрерывное каноническое чтение, мы перераспределяем
 * их ровно по запрошенному числу дней (±1 глава, остаток — в первые дни),
 * перенумеровываем дни подряд и пересобираем подписи по фактическому диапазону.
 *
 * Тематические планы (не канонический порядок) не трогаем — только перенумеровываем
 * дни подряд с 1, иначе дубликаты/пропуски номеров ломают UNIQUE (plan_id, day_index).
 */
export function rebalancePlanDays(
  days: BiblePlanDayInput[],
  requestedDays: number,
): BiblePlanDayInput[] {
  if (days.length === 0) return days;
  const refs = days.flatMap((d) => d.refs);
  if (refs.length === 0) return days;

  if (!isCanonicalSequence(refs)) {
    return days.map((d, i) => ({ day: i + 1, label: d.label, refs: d.refs }));
  }

  const n = Math.max(
    1,
    Math.min(Math.floor(requestedDays) || days.length, refs.length),
  );
  const sizes = evenChunkSizes(refs.length, n);
  const keepAsIs =
    n === days.length && days.every((d, i) => d.refs.length === sizes[i]);

  const out: BiblePlanDayInput[] = [];
  let offset = 0;
  for (let i = 0; i < n; i += 1) {
    const chunk = refs.slice(offset, offset + sizes[i]!);
    offset += sizes[i]!;
    const prev = days[i];
    const unchanged = keepAsIs && prev != null && sameRefs(prev.refs, chunk);
    out.push({
      day: i + 1,
      label: unchanged ? prev.label : buildPlanDayLabel(chunk),
      refs: chunk,
    });
  }
  return out;
}

export async function listPlans(memberId: number): Promise<BiblePlanRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT p.id, p.member_id, p.title, p.goal, p.start_date::text, p.end_date::text, p.status,
            p.ai_prompt, p.created_at::text, p.updated_at::text,
            COALESCE(stats.days_total, 0)::int AS days_total,
            COALESCE(stats.days_completed, 0)::int AS days_completed
     FROM bible_reading_plans p
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS days_total,
              COUNT(*) FILTER (WHERE d.completed_at IS NOT NULL)::int AS days_completed
       FROM bible_reading_plan_days d
       WHERE d.plan_id = p.id
     ) stats ON TRUE
     WHERE p.member_id = $1
     ORDER BY p.updated_at DESC
     LIMIT 100`,
    [memberId],
  );
  return r.rows;
}

export async function getPlan(memberId: number, planId: number): Promise<BiblePlanRow | null> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT id, member_id, title, goal, start_date::text, end_date::text, status,
            ai_prompt, created_at::text, updated_at::text
     FROM bible_reading_plans
     WHERE id = $1 AND member_id = $2
     LIMIT 1`,
    [planId, memberId],
  );
  const plan = r.rows[0];
  if (!plan) return null;

  const days = await query(
    `SELECT id, plan_id, day_index, day_date::text, label, refs_json, completed_at::text
     FROM bible_reading_plan_days
     WHERE plan_id = $1
     ORDER BY day_index`,
    [planId],
  );

  plan.days = days.rows.map((d) => ({
    id: d.id,
    plan_id: d.plan_id,
    day_index: d.day_index,
    day_date: d.day_date,
    label: d.label,
    refs_json: normalizeRefs(d.refs_json),
    completed_at: d.completed_at,
  }));
  return plan;
}

export async function createPlanWithDays(
  memberId: number,
  input: {
    title: string;
    goal?: string;
    startDate?: string | null;
    endDate?: string | null;
    aiPrompt?: string | null;
    days: Array<{ day: number; label?: string; refs: BiblePlanRef[]; dayDate?: string | null }>;
  },
): Promise<BiblePlanRow> {
  await ensureBibleSchema();
  const inserted = await query(
    `INSERT INTO bible_reading_plans (member_id, title, goal, start_date, end_date, ai_prompt)
     VALUES ($1, $2, $3, $4::date, $5::date, $6)
     RETURNING id`,
    [
      memberId,
      input.title.slice(0, 500),
      (input.goal ?? '').slice(0, 4000),
      input.startDate ?? null,
      input.endDate ?? null,
      input.aiPrompt ?? null,
    ],
  );
  const planId = inserted.rows[0]!.id;

  for (const day of input.days) {
    await query(
      `INSERT INTO bible_reading_plan_days (plan_id, day_index, day_date, label, refs_json)
       VALUES ($1, $2, $3::date, $4, $5::jsonb)`,
      [
        planId,
        day.day,
        day.dayDate ?? null,
        (day.label ?? '').slice(0, 500),
        JSON.stringify(day.refs),
      ],
    );
  }

  const plan = await getPlan(memberId, planId);
  if (!plan) throw new Error('plan_create_failed');
  return plan;
}

export async function setPlanDayCompleted(
  memberId: number,
  planId: number,
  dayIndex: number,
  completed: boolean,
): Promise<BiblePlanDayRow | null> {
  await ensureBibleSchema();
  const plan = await getPlan(memberId, planId);
  if (!plan) return null;

  await query(
    `UPDATE bible_reading_plan_days
     SET completed_at = CASE WHEN $3 THEN COALESCE(completed_at, NOW()) ELSE NULL END
     WHERE plan_id = $1 AND day_index = $2`,
    [planId, dayIndex, completed],
  );
  await query(`UPDATE bible_reading_plans SET updated_at = NOW() WHERE id = $1`, [planId]);

  const refreshed = await getPlan(memberId, planId);
  return refreshed?.days?.find((d) => d.day_index === dayIndex) ?? null;
}

export async function deletePlan(memberId: number, planId: number): Promise<boolean> {
  await ensureBibleSchema();
  const r = await query(`DELETE FROM bible_reading_plans WHERE id = $1 AND member_id = $2`, [
    planId,
    memberId,
  ]);
  return (r.rowCount ?? 0) > 0;
}
