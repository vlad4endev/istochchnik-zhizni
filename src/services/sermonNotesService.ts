import { query } from '../config/db';

const PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS = Math.min(
  3650,
  Math.max(1, Math.floor(Number(process.env.PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS ?? '365') || 365)),
);

let schemaInit: Promise<void> | null = null;

/**
 * Гарантирует таблицу sermon_notes даже при SKIP_DB_INIT_ON_START в проде.
 * Вызывается на boot и перед каждым запросом к API.
 */
export async function ensureSermonNotesSchema(): Promise<void> {
  if (!schemaInit) {
    schemaInit = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS public.sermon_notes (
          id BIGSERIAL PRIMARY KEY,
          member_id INTEGER NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL DEFAULT '',
          topic VARCHAR(500) NOT NULL DEFAULT '',
          scripture VARCHAR(500) NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          body_format VARCHAR(32) NOT NULL DEFAULT 'plain',
          is_public BOOLEAN NOT NULL DEFAULT FALSE,
          share_token UUID UNIQUE DEFAULT gen_random_uuid(),
          share_token_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          service_plan_id BIGINT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(
        `ALTER TABLE public.sermon_notes ADD COLUMN IF NOT EXISTS body_format VARCHAR(32) NOT NULL DEFAULT 'plain'`,
      );
      await query(
        `ALTER TABLE public.sermon_notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE`,
      );
      await query(
        `ALTER TABLE public.sermon_notes ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid()`,
      );
      await query(
        `ALTER TABLE public.sermon_notes ADD COLUMN IF NOT EXISTS share_token_issued_at TIMESTAMPTZ`,
      );
      await query(`UPDATE public.sermon_notes SET share_token = gen_random_uuid() WHERE share_token IS NULL`);
      await query(`
        UPDATE public.sermon_notes
        SET share_token_issued_at = COALESCE(share_token_issued_at, created_at, NOW())
        WHERE share_token_issued_at IS NULL
      `);
      await query(
        `ALTER TABLE public.sermon_notes ALTER COLUMN share_token_issued_at SET DEFAULT NOW()`,
      );
      await query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'sermon_notes'
              AND column_name = 'share_token_issued_at'
              AND is_nullable = 'YES'
          ) THEN
            ALTER TABLE public.sermon_notes ALTER COLUMN share_token_issued_at SET NOT NULL;
          END IF;
        END $$
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_sermon_notes_member_updated
          ON public.sermon_notes (member_id, updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_sermon_notes_service_plan
          ON public.sermon_notes (service_plan_id)
          WHERE service_plan_id IS NOT NULL
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_sermon_notes_share_token
          ON public.sermon_notes (share_token)
          WHERE is_public = TRUE
      `);
      await query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'service_plans'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND table_name = 'sermon_notes'
              AND constraint_name = 'sermon_notes_service_plan_id_fkey'
          ) THEN
            ALTER TABLE public.sermon_notes
              ADD CONSTRAINT sermon_notes_service_plan_id_fkey
              FOREIGN KEY (service_plan_id) REFERENCES public.service_plans(id) ON DELETE SET NULL;
          END IF;
        END $$
      `);
    })().catch((e) => {
      schemaInit = null;
      throw e;
    });
  }
  await schemaInit;
}

export type SermonNoteBodyFormat = 'plain' | 'html';

export interface SermonNoteListItem {
  id: string;
  member_id: number;
  title: string;
  topic: string;
  scripture: string;
  updated_at: string;
  created_at: string;
  service_plan_id: number | null;
  is_public: boolean;
  body_format: SermonNoteBodyFormat;
  /** Дата служения привязанной программы (YYYY-MM-DD). */
  plan_service_date: string | null;
  plan_start_time: string | null;
  plan_template_name: string | null;
}

export interface SermonNoteRow extends SermonNoteListItem {
  body: string;
  share_token: string;
  share_token_issued_at: string;
}

export interface PublicSermonNote {
  id: string;
  title: string;
  topic: string;
  scripture: string;
  body: string;
  body_format: SermonNoteBodyFormat;
  updated_at: string;
  author_name: string | null;
}

/** Краткая карточка конспекта для блока «Проповедь» в программе. */
export interface LinkedSermonNoteSummary {
  id: string;
  title: string;
  topic: string;
  scripture: string;
  member_id: number;
  author_name: string | null;
  is_public: boolean;
  share_token: string | null;
  updated_at: string;
}

function normalizeBodyFormat(raw: unknown): SermonNoteBodyFormat {
  return String(raw ?? '').toLowerCase() === 'html' ? 'html' : 'plain';
}

function toTimeHm(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

function mapListRow(r: Record<string, unknown>): SermonNoteListItem {
  const planRaw = r.service_plan_id;
  return {
    id: String(r.id),
    member_id: Number(r.member_id),
    title: String(r.title ?? ''),
    topic: String(r.topic ?? ''),
    scripture: String(r.scripture ?? ''),
    updated_at: String(r.updated_at),
    created_at: String(r.created_at),
    service_plan_id: planRaw == null || planRaw === '' ? null : Number(planRaw),
    is_public: Boolean(r.is_public),
    body_format: normalizeBodyFormat(r.body_format),
    plan_service_date: r.plan_service_date == null ? null : String(r.plan_service_date),
    plan_start_time: toTimeHm(r.plan_start_time),
    plan_template_name:
      r.plan_template_name == null || String(r.plan_template_name).trim() === ''
        ? null
        : String(r.plan_template_name).trim(),
  };
}

function mapFullRow(r: Record<string, unknown>): SermonNoteRow {
  return {
    ...mapListRow(r),
    body: String(r.body ?? ''),
    share_token: r.share_token != null ? String(r.share_token) : '',
    share_token_issued_at: String(r.share_token_issued_at ?? r.updated_at ?? ''),
  };
}

const NOTE_SELECT_WITH_PLAN = `
  n.id, n.member_id, n.title, n.topic, n.scripture, n.body, n.body_format,
  n.service_plan_id, n.is_public, n.share_token, n.share_token_issued_at,
  n.created_at, n.updated_at,
  p.service_date::text AS plan_service_date,
  p.start_time AS plan_start_time,
  t.name AS plan_template_name
`;

async function syncSermonBlocksFromNote(note: {
  id: string;
  service_plan_id: number | null;
  topic: string;
  scripture: string;
  title: string;
}): Promise<void> {
  const planId = note.service_plan_id;
  if (planId == null || !Number.isFinite(planId) || planId <= 0) return;

  const planRes = await query(
    `SELECT preacher_member_id,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''),
              NULLIF(TRIM(pr.name), ''),
              'Проповедник'
            ) AS preacher_name
     FROM public.service_plans p
     LEFT JOIN public.members pr ON pr.id = p.preacher_member_id
     WHERE p.id = $1
     LIMIT 1`,
    [planId],
  );
  const planRow = planRes.rows[0] as
    | { preacher_member_id?: unknown; preacher_name?: unknown }
    | undefined;
  if (!planRow) return;

  const preacherName = String(planRow.preacher_name ?? 'Проповедник').trim() || 'Проповедник';
  const topic = note.topic.trim() || note.title.trim();
  const scripture = note.scripture.trim();
  const blockTitle = topic ? `${preacherName} - ${topic}` : preacherName;
  const noteIdNum = Number(note.id);

  await query(
    `UPDATE public.service_blocks b
     SET title = $2,
         content_json = COALESCE(b.content_json, '{}'::jsonb)
           || jsonb_build_object(
                'sermon_topic', $3::text,
                'sermon_scripture', $4::text,
                'sermon_note_id', $5::bigint
              )
     FROM public.block_types bt
     WHERE b.service_plan_id = $1
       AND bt.id = b.block_type_id
       AND (bt.code = 'sermon' OR lower(bt.name) LIKE '%проповед%')`,
    [planId, blockTitle, topic, scripture, Number.isFinite(noteIdNum) ? noteIdNum : null],
  );
}

export async function getLinkedSermonNoteForPlan(
  planId: number,
): Promise<LinkedSermonNoteSummary | null> {
  await ensureSermonNotesSchema();
  if (!Number.isFinite(planId) || planId <= 0) return null;
  const result = await query(
    `SELECT n.id, n.title, n.topic, n.scripture, n.member_id, n.is_public,
            n.share_token::text AS share_token, n.updated_at::text AS updated_at,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), ''),
              NULLIF(TRIM(m.name), '')
            ) AS author_name
     FROM public.sermon_notes n
     LEFT JOIN public.members m ON m.id = n.member_id
     LEFT JOIN public.service_plans p ON p.id = n.service_plan_id
     WHERE n.service_plan_id = $1
     ORDER BY
       CASE WHEN p.preacher_member_id IS NOT NULL AND n.member_id = p.preacher_member_id THEN 0 ELSE 1 END,
       n.updated_at DESC
     LIMIT 1`,
    [planId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const isPublic = Boolean(row.is_public);
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    topic: String(row.topic ?? ''),
    scripture: String(row.scripture ?? ''),
    member_id: Number(row.member_id),
    author_name: row.author_name != null ? String(row.author_name) : null,
    is_public: isPublic,
    share_token: isPublic && row.share_token != null ? String(row.share_token) : null,
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function listSermonNotes(memberId: number): Promise<SermonNoteListItem[]> {
  await ensureSermonNotesSchema();
  const result = await query(
    `SELECT ${NOTE_SELECT_WITH_PLAN}
     FROM sermon_notes n
     LEFT JOIN public.service_plans p ON p.id = n.service_plan_id
     LEFT JOIN public.service_templates t ON t.id = p.template_id
     WHERE n.member_id = $1
     ORDER BY n.updated_at DESC`,
    [memberId],
  );
  return result.rows.map((row) => mapListRow(row as Record<string, unknown>));
}

export async function getSermonNote(
  memberId: number,
  noteId: number,
): Promise<SermonNoteRow | null> {
  await ensureSermonNotesSchema();
  const result = await query(
    `SELECT ${NOTE_SELECT_WITH_PLAN}
     FROM sermon_notes n
     LEFT JOIN public.service_plans p ON p.id = n.service_plan_id
     LEFT JOIN public.service_templates t ON t.id = p.template_id
     WHERE n.id = $1 AND n.member_id = $2`,
    [noteId, memberId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapFullRow(row) : null;
}

export async function createSermonNote(
  memberId: number,
  input: {
    title?: string;
    topic?: string;
    scripture?: string;
    body?: string;
    body_format?: SermonNoteBodyFormat;
    service_plan_id?: number | null;
  } = {},
): Promise<SermonNoteRow> {
  await ensureSermonNotesSchema();
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const scripture = typeof input.scripture === 'string' ? input.scripture.trim() : '';
  const body = typeof input.body === 'string' ? input.body : '';
  const bodyFormat: SermonNoteBodyFormat = input.body_format === 'html' ? 'html' : 'html';
  let planId: number | null = null;
  if (input.service_plan_id !== undefined) {
    if (input.service_plan_id == null) planId = null;
    else if (Number.isInteger(input.service_plan_id) && input.service_plan_id > 0) {
      planId = input.service_plan_id;
    }
  }
  if (planId != null) {
    await query(
      `UPDATE sermon_notes SET service_plan_id = NULL, updated_at = NOW()
       WHERE member_id = $1 AND service_plan_id = $2`,
      [memberId, planId],
    );
  }
  const result = await query(
    `INSERT INTO sermon_notes (member_id, title, topic, scripture, body, body_format, service_plan_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING id`,
    [memberId, title, topic, scripture, body, bodyFormat, planId],
  );
  const id = Number((result.rows[0] as { id: unknown }).id);
  const created = await getSermonNote(memberId, id);
  if (!created) throw new Error('Failed to load created sermon note');
  if (created.service_plan_id != null) {
    await syncSermonBlocksFromNote(created);
  }
  return created;
}

export async function updateSermonNote(
  memberId: number,
  noteId: number,
  input: {
    title?: string;
    topic?: string;
    scripture?: string;
    body?: string;
    body_format?: SermonNoteBodyFormat;
    service_plan_id?: number | null;
  },
): Promise<SermonNoteRow | null> {
  await ensureSermonNotesSchema();
  const fields: string[] = [];
  const vals: unknown[] = [];
  let n = 0;
  const push = (col: string, v: unknown) => {
    n += 1;
    fields.push(`${col} = $${n}`);
    vals.push(v);
  };
  if (input.title !== undefined) push('title', input.title.trim());
  if (input.topic !== undefined) push('topic', input.topic.trim());
  if (input.scripture !== undefined) push('scripture', input.scripture.trim());
  if (input.body !== undefined) push('body', input.body);
  if (input.body_format !== undefined) {
    push('body_format', input.body_format === 'html' ? 'html' : 'plain');
  }
  if (input.service_plan_id !== undefined) {
    const planId =
      input.service_plan_id == null
        ? null
        : Number.isInteger(input.service_plan_id) && input.service_plan_id > 0
          ? input.service_plan_id
          : null;
    if (planId != null) {
      await query(
        `UPDATE sermon_notes SET service_plan_id = NULL, updated_at = NOW()
         WHERE member_id = $1 AND service_plan_id = $2 AND id <> $3`,
        [memberId, planId, noteId],
      );
    }
    push('service_plan_id', planId);
  }
  if (fields.length === 0) {
    return getSermonNote(memberId, noteId);
  }
  fields.push('updated_at = NOW()');
  vals.push(noteId, memberId);
  const result = await query(
    `UPDATE sermon_notes SET ${fields.join(', ')} WHERE id = $${n + 1} AND member_id = $${n + 2} RETURNING id`,
    vals,
  );
  if (!result.rows[0]) return null;
  const updated = await getSermonNote(memberId, noteId);
  if (
    updated &&
    updated.service_plan_id != null &&
    (input.service_plan_id !== undefined ||
      input.topic !== undefined ||
      input.scripture !== undefined ||
      input.title !== undefined)
  ) {
    await syncSermonBlocksFromNote(updated);
  }
  return updated;
}

export async function deleteSermonNote(memberId: number, noteId: number): Promise<boolean> {
  await ensureSermonNotesSchema();
  const result = await query(`DELETE FROM sermon_notes WHERE id = $1 AND member_id = $2`, [
    noteId,
    memberId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateSermonNoteShare(
  memberId: number,
  noteId: number,
  input: { is_public: boolean; rotate_token?: boolean },
): Promise<SermonNoteRow | null> {
  await ensureSermonNotesSchema();
  const result = await query(
    `UPDATE sermon_notes
     SET is_public = $1,
         share_token = CASE
           WHEN $4::boolean THEN gen_random_uuid()
           ELSE COALESCE(share_token, gen_random_uuid())
         END,
         share_token_issued_at = CASE
           WHEN $1::boolean OR $4::boolean THEN NOW()
           ELSE share_token_issued_at
         END,
         updated_at = NOW()
     WHERE id = $2 AND member_id = $3
     RETURNING id`,
    [input.is_public, noteId, memberId, Boolean(input.rotate_token)],
  );
  if (!result.rows[0]) return null;
  return getSermonNote(memberId, noteId);
}

export async function getPublicSermonNoteByToken(token: string): Promise<PublicSermonNote | null> {
  await ensureSermonNotesSchema();
  const t = token.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(t)) {
    return null;
  }
  const result = await query(
    `SELECT n.id, n.title, n.topic, n.scripture, n.body, n.body_format, n.updated_at,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), ''),
              NULLIF(TRIM(m.name), '')
            ) AS author_name
     FROM sermon_notes n
     LEFT JOIN members m ON m.id = n.member_id
     WHERE n.share_token = $1::uuid
       AND n.is_public = TRUE
       AND n.share_token_issued_at >= NOW() - ($2::int * INTERVAL '1 day')
     LIMIT 1`,
    [t, PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    topic: String(row.topic ?? ''),
    scripture: String(row.scripture ?? ''),
    body: String(row.body ?? ''),
    body_format: normalizeBodyFormat(row.body_format),
    updated_at: String(row.updated_at),
    author_name: row.author_name != null ? String(row.author_name) : null,
  };
}
