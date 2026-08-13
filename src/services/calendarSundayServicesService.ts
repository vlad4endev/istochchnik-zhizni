import { query } from '../config/db';
import { listSundaySchedulePlans, type SundaySchedulePlanRow } from './sundayScheduleService';

export type CalendarSundayServicePerson = {
  id: number;
  name: string;
  avatar_url: string | null;
};

export type CalendarSundayServiceSong = {
  title: string;
  key: string | null;
};

export type CalendarSundayService = {
  id: number;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published' | null;
  template_name: string | null;
  title: string;
  has_program: boolean;
  share_token: string | null;
  leader: CalendarSundayServicePerson | null;
  preacher: CalendarSundayServicePerson | null;
  sermon_topic: string | null;
  sermon_scripture: string | null;
  songs: CalendarSundayServiceSong[];
};

type PlanBlockRow = {
  service_plan_id: number;
  title: string;
  content_json: unknown;
  block_type_code: string | null;
  block_kind: string | null;
  song_title: string | null;
  song_key: string | null;
  order_index: number;
};

type PlanMetaRow = {
  id: number;
  share_token: string | null;
  status: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string): boolean {
  if (!YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m ?? 1) - 1 && dt.getUTCDate() === d;
}

/** Воскресенье для календарной даты YYYY-MM-DD (ISO, без сдвига таймзоны). */
export function isSundayYmd(ymd: string): boolean {
  if (!isValidYmd(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() === 0;
}

export function sundayServiceTitle(templateName: string | null | undefined): string {
  const name = String(templateName ?? '').trim();
  return name || 'Воскресное служение';
}

function asObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function contentString(cj: Record<string, unknown>, key: string): string {
  const v = cj[key];
  if (typeof v === 'string') return v.trim();
  return '';
}

function parseSermonTopicFromBlockTitle(title: string): string {
  const t = String(title ?? '').trim();
  if (!t) return '';
  const parts = t.split(/\s+[—–-]\s+/);
  if (parts.length < 2) return '';
  const topic = parts.slice(1).join(' - ').trim();
  if (!topic || /^проповед/i.test(topic)) return '';
  return topic;
}

function isSermonBlock(b: PlanBlockRow): boolean {
  const cj = asObject(b.content_json);
  if (cj.is_separator === true) return false;
  const code = String(b.block_type_code ?? '').toLowerCase();
  if (code === 'sermon') return true;
  if (contentString(cj, 'sermon_topic') || contentString(cj, 'sermon_scripture')) return true;
  const title = String(b.title ?? '').toLowerCase();
  return title.includes('проповед');
}

export function pickSermonFromBlocks(blocks: PlanBlockRow[]): {
  topic: string | null;
  scripture: string | null;
} {
  const sermon = blocks.find(isSermonBlock);
  if (!sermon) return { topic: null, scripture: null };
  const cj = asObject(sermon.content_json);
  const topic =
    contentString(cj, 'sermon_topic') ||
    contentString(cj, 'topic') ||
    parseSermonTopicFromBlockTitle(sermon.title) ||
    null;
  const scripture =
    contentString(cj, 'sermon_scripture') ||
    contentString(cj, 'scripture') ||
    null;
  return { topic, scripture };
}

function isSongBlock(b: PlanBlockRow): boolean {
  const code = String(b.block_type_code ?? '').toLowerCase();
  const kind = String(b.block_kind ?? '').toLowerCase();
  if (code === 'song' || kind === 'song') return true;
  return Boolean(String(b.song_title ?? '').trim());
}

export function pickSongsFromBlocks(blocks: PlanBlockRow[]): CalendarSundayServiceSong[] {
  const out: CalendarSundayServiceSong[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (!isSongBlock(b)) continue;
    const title = (b.song_title ?? '').trim() || String(b.title ?? '').trim();
    if (!title) continue;
    const key = (b.song_key ?? '').trim() || null;
    const dedupe = `${title.toLowerCase()}|${key ?? ''}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ title, key });
  }
  return out;
}

function personFromPlan(row: SundaySchedulePlanRow, role: 'leader' | 'preacher'): CalendarSundayServicePerson | null {
  const src = role === 'leader' ? row.leader : row.preacher;
  if (!src) return null;
  return {
    id: src.id,
    name: src.name,
    avatar_url: src.avatar_url,
  };
}

export function assembleSundayService(
  row: SundaySchedulePlanRow,
  extras: {
    share_token: string | null;
    status: 'draft' | 'published' | null;
    sermon_topic: string | null;
    sermon_scripture: string | null;
    songs: CalendarSundayServiceSong[];
  },
): CalendarSundayService {
  return {
    id: row.id,
    service_date: row.service_date,
    start_time: row.start_time || '10:00',
    status: extras.status,
    template_name: row.template_name,
    title: sundayServiceTitle(row.template_name),
    has_program: row.has_program,
    share_token: extras.share_token,
    leader: personFromPlan(row, 'leader'),
    preacher: personFromPlan(row, 'preacher'),
    sermon_topic: extras.sermon_topic,
    sermon_scripture: extras.sermon_scripture,
    songs: extras.songs,
  };
}

async function loadPlanMeta(planIds: number[]): Promise<Map<number, PlanMetaRow>> {
  const map = new Map<number, PlanMetaRow>();
  if (planIds.length === 0) return map;
  const res = await query(
    `select id, share_token::text as share_token, status
     from public.service_plans
     where id = any($1::int[])`,
    [planIds],
  );
  for (const raw of res.rows as Record<string, unknown>[]) {
    const id = Number(raw.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    map.set(id, {
      id,
      share_token: raw.share_token == null ? null : String(raw.share_token),
      status: raw.status == null ? null : String(raw.status),
    });
  }
  return map;
}

async function loadPlanBlocks(planIds: number[]): Promise<Map<number, PlanBlockRow[]>> {
  const map = new Map<number, PlanBlockRow[]>();
  if (planIds.length === 0) return map;
  const res = await query(
    `select
       b.service_plan_id,
       b.title,
       b.content_json,
       b.order_index,
       bt.code as block_type_code,
       bt.kind as block_kind,
       s.title as song_title,
       s.default_key as song_key
     from public.service_blocks b
     left join public.block_types bt on bt.id = b.block_type_id
     left join public.songs s on s.id = b.song_id
     where b.service_plan_id = any($1::int[])
     order by b.order_index asc, b.id asc`,
    [planIds],
  );
  for (const raw of res.rows as Record<string, unknown>[]) {
    const planId = Number(raw.service_plan_id);
    if (!Number.isInteger(planId) || planId <= 0) continue;
    const row: PlanBlockRow = {
      service_plan_id: planId,
      title: String(raw.title ?? ''),
      content_json: raw.content_json,
      block_type_code: raw.block_type_code == null ? null : String(raw.block_type_code),
      block_kind: raw.block_kind == null ? null : String(raw.block_kind),
      song_title: raw.song_title == null ? null : String(raw.song_title),
      song_key: raw.song_key == null ? null : String(raw.song_key),
      order_index: Number(raw.order_index ?? 0),
    };
    const list = map.get(planId) ?? [];
    list.push(row);
    map.set(planId, list);
  }
  return map;
}

/**
 * Воскресные служения в диапазоне дат: программа, ведущий, проповедь и песни.
 * Слоты без программы тоже попадают, если назначены ведущий или проповедник.
 */
export async function listCalendarSundayServices(input: {
  from: string;
  to: string;
}): Promise<CalendarSundayService[]> {
  const from = input.from.slice(0, 10);
  const to = input.to.slice(0, 10);
  if (!isValidYmd(from) || !isValidYmd(to)) return [];
  if (from.localeCompare(to) > 0) return [];

  const rows = await listSundaySchedulePlans({ from, to });
  const sundays = rows.filter((row) => isSundayYmd(row.service_date));
  const planIds = sundays.filter((row) => row.id > 0).map((row) => row.id);

  let metaById = new Map<number, PlanMetaRow>();
  let blocksById = new Map<number, PlanBlockRow[]>();
  try {
    [metaById, blocksById] = await Promise.all([loadPlanMeta(planIds), loadPlanBlocks(planIds)]);
  } catch (err) {
    console.warn('[calendar-sunday-services] extras load failed', err);
  }

  return sundays.map((row) => {
    const meta = row.id > 0 ? metaById.get(row.id) : undefined;
    const blocks = row.id > 0 ? (blocksById.get(row.id) ?? []) : [];
    const sermon = pickSermonFromBlocks(blocks);
    const statusRaw = meta?.status;
    const status = statusRaw === 'published' || statusRaw === 'draft' ? statusRaw : row.status;
    return assembleSundayService(row, {
      share_token: meta?.share_token ?? null,
      status,
      sermon_topic: sermon.topic,
      sermon_scripture: sermon.scripture,
      songs: pickSongsFromBlocks(blocks),
    });
  });
}
