import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { findBookDefBySlug } from '../bible/bibleBookCatalog';

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
  days: Array<{ day: number; label?: string; refs: BiblePlanRef[] }>;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'План чтения';
  if (!Array.isArray(o.days) || o.days.length === 0) return null;
  const days: Array<{ day: number; label?: string; refs: BiblePlanRef[] }> = [];
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
    aiPrompt?: string | null;
    days: Array<{ day: number; label?: string; refs: BiblePlanRef[]; dayDate?: string | null }>;
  },
): Promise<BiblePlanRow> {
  await ensureBibleSchema();
  const inserted = await query(
    `INSERT INTO bible_reading_plans (member_id, title, goal, start_date, ai_prompt)
     VALUES ($1, $2, $3, $4::date, $5)
     RETURNING id`,
    [
      memberId,
      input.title.slice(0, 500),
      (input.goal ?? '').slice(0, 4000),
      input.startDate ?? null,
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
