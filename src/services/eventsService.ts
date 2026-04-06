import { defaultChurchEventCategory } from '../constants/churchEventCategories';
import { query } from '../config/db';

/** Публичная модель события (API / дашборд). */
export interface ChurchEvent {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day: number | null;
  is_active: boolean;
  category?: string | null;
  created_at: string;
  updated_at: string;
}

/** Вход создания события: одна «ось» дата+время + повторяемость + опции. */
export interface CreateChurchEventInput {
  title: string;
  description?: string | null;
  /** Для `weekly` — якорная календарная дата (ближайший такой день недели в UI). */
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day?: number | null;
  is_active?: boolean;
  /** Если в БД есть колонка `category`. Иначе игнорируется. */
  category?: string | null;
}

type EventsSchemaState = {
  hasTable: boolean;
  tableRef: string;
  hasFullRecurrenceShape: boolean;
  hasRecurrenceTypeColumn: boolean;
  hasWeeklyDayColumn: boolean;
  hasStartsAtColumn: boolean;
  hasEndsAtColumn: boolean;
  columnNames: Set<string>;
  columnMeta: Map<string, ColumnMeta>;
};

type ColumnMeta = {
  is_nullable: string;
  column_default: string | null;
  data_type: string;
  udt_name: string;
};

type ExtraInsertSpec =
  | { kind: 'param'; column: string; value: unknown }
  | { kind: 'sql'; column: string; sqlExpr: string };

/** Уже заполняем осознанно в assembleCreateInsert; остальное — только gap-fill для чужих NOT NULL. */
const LEGACY_GAP_SKIP = new Set([
  'id',
  'title',
  'description',
  'event_date',
  'event_time',
  'recurrence_type',
  'weekly_day',
  'is_active',
  'category',
  'starts_at',
  'ends_at',
]);

function hasDbDefault(m: Pick<ColumnMeta, 'column_default'>): boolean {
  return m.column_default != null && String(m.column_default).trim() !== '';
}

function computeLegacyNotNullGap(
  colMeta: Map<string, ColumnMeta> | undefined,
  alreadyWritten: Set<string>,
): ExtraInsertSpec[] {
  if (!colMeta || colMeta.size === 0) {
    return [];
  }
  const specs: ExtraInsertSpec[] = [];
  for (const [col, m] of colMeta) {
    if (alreadyWritten.has(col) || LEGACY_GAP_SKIP.has(col)) {
      continue;
    }
    if (m.is_nullable === 'YES') {
      continue;
    }
    if (hasDbDefault(m)) {
      continue;
    }
    const dt = m.data_type.toLowerCase();
    if (col === 'created_at' || col === 'updated_at') {
      specs.push({ kind: 'sql', column: col, sqlExpr: 'NOW()' });
      continue;
    }
    if (dt === 'boolean') {
      specs.push({ kind: 'sql', column: col, sqlExpr: 'FALSE' });
      continue;
    }
    if (dt === 'smallint' || dt === 'integer' || dt === 'bigint') {
      specs.push({ kind: 'param', column: col, value: 0 });
      continue;
    }
    if (dt === 'real' || dt === 'double precision' || dt === 'numeric') {
      specs.push({ kind: 'sql', column: col, sqlExpr: '0' });
      continue;
    }
    if (dt === 'character varying' || dt === 'text' || dt === 'character') {
      specs.push({ kind: 'param', column: col, value: '' });
      continue;
    }
    if (dt === 'uuid') {
      specs.push({ kind: 'sql', column: col, sqlExpr: 'gen_random_uuid()' });
      continue;
    }
    if (dt === 'jsonb') {
      specs.push({ kind: 'sql', column: col, sqlExpr: "'{}'::jsonb" });
      continue;
    }
    if (dt === 'json') {
      specs.push({ kind: 'sql', column: col, sqlExpr: "'{}'::json" });
      continue;
    }
    if (dt === 'timestamp with time zone' || dt === 'timestamp without time zone') {
      specs.push({ kind: 'sql', column: col, sqlExpr: '($3::date + $4::time)' });
      continue;
    }
    if (dt === 'date') {
      specs.push({ kind: 'sql', column: col, sqlExpr: '$3::date' });
      continue;
    }
    if (dt === 'time without time zone') {
      specs.push({ kind: 'sql', column: col, sqlExpr: '$4::time' });
      continue;
    }
    if (dt === 'USER-DEFINED') {
      const envVal = process.env[`CHURCH_EVENT_DEFAULT_${col.toUpperCase()}`]?.trim();
      specs.push({ kind: 'param', column: col, value: envVal && envVal.length > 0 ? envVal : '' });
      continue;
    }
    specs.push({ kind: 'param', column: col, value: '' });
  }
  specs.sort((a, b) => a.column.localeCompare(b.column));
  return specs;
}

const SCHEMA_CACHE_TTL_MS = 60_000;
let churchEventsSchemaCache: { state: EventsSchemaState; loadedAt: number } | null = null;

export function invalidateChurchEventsSchemaCache(): void {
  churchEventsSchemaCache = null;
}

function buildExtraInsertSql(
  specs: ExtraInsertSpec[],
  startParam: number,
): { columns: string; valuesSql: string; params: unknown[] } {
  if (specs.length === 0) {
    return { columns: '', valuesSql: '', params: [] };
  }
  const params: unknown[] = [];
  let p = startParam;
  const colParts: string[] = [];
  const valParts: string[] = [];
  for (const s of specs) {
    colParts.push(quoteIdent(s.column));
    if (s.kind === 'sql') {
      valParts.push(s.sqlExpr);
    } else {
      valParts.push(`$${p++}`);
      params.push(s.value);
    }
  }
  return {
    columns: `, ${colParts.join(', ')}`,
    valuesSql: `, ${valParts.join(', ')}`,
    params,
  };
}

/** DDL для church_events — один раз за процесс (идемпотентно). */
let churchEventsDdlOnce: Promise<void> | null = null;

function isInsufficientPrivilegeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
  return code === '42501';
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function tableRefForSchema(schema: string): string {
  return `${quoteIdent(schema)}."church_events"`;
}

/** В старых БД `description` часто NOT NULL — в БД храним пустую строку; в API пустое → null. */
function descriptionForInsert(raw: string | null | undefined): string {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
}

function selectEventProjection(
  schema: Pick<EventsSchemaState, 'hasFullRecurrenceShape' | 'hasRecurrenceTypeColumn' | 'columnNames'>,
): string {
  const descExpr = `NULLIF(BTRIM(description), '') AS description`;
  const catSql = schema.columnNames.has('category') ? ', category' : '';
  if (schema.hasFullRecurrenceShape) {
    return `
      id,
      title,
      ${descExpr},
      event_date::text AS event_date,
      to_char(event_time, 'HH24:MI') AS event_time,
      recurrence_type,
      weekly_day,
      is_active${catSql},
      created_at::text AS created_at,
      updated_at::text AS updated_at
    `;
  }
  if (schema.hasRecurrenceTypeColumn) {
    return `
      id,
      title,
      ${descExpr},
      event_date::text AS event_date,
      to_char(event_time, 'HH24:MI') AS event_time,
      recurrence_type,
      NULL::smallint AS weekly_day,
      is_active${catSql},
      created_at::text AS created_at,
      updated_at::text AS updated_at
    `;
  }
  return `
      id,
      title,
      ${descExpr},
      event_date::text AS event_date,
      to_char(event_time, 'HH24:MI') AS event_time,
      'once'::text AS recurrence_type,
      NULL::smallint AS weekly_day,
      is_active${catSql},
      created_at::text AS created_at,
      updated_at::text AS updated_at
    `;
}

async function readEventsSchemaState(): Promise<EventsSchemaState> {
  const currentSchemaRes = await query('SELECT current_schema() AS schema_name');
  const currentSchema =
    (currentSchemaRes.rows[0] as { schema_name?: unknown } | undefined)?.schema_name;
  const preferredSchema =
    typeof currentSchema === 'string' && currentSchema.trim() ? currentSchema : 'public';

  const columns = await query(
    `SELECT table_schema, column_name, is_nullable, column_default, data_type, udt_name
     FROM information_schema.columns
     WHERE table_name = 'church_events'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
  );
  const bySchema = new Map<string, Set<string>>();
  const metaBySchema = new Map<string, Map<string, ColumnMeta>>();
  for (const row of columns.rows) {
    const tableSchema = (row as { table_schema?: unknown }).table_schema;
    const columnName = (row as { column_name?: unknown }).column_name;
    if (typeof tableSchema !== 'string' || typeof columnName !== 'string') continue;
    const key = tableSchema.trim();
    if (!key) continue;
    if (!bySchema.has(key)) bySchema.set(key, new Set<string>());
    bySchema.get(key)!.add(columnName);
    const nullableRaw = (row as { is_nullable?: unknown }).is_nullable;
    const defRaw = (row as { column_default?: unknown }).column_default;
    const dataTypeRaw = (row as { data_type?: unknown }).data_type;
    const udtRaw = (row as { udt_name?: unknown }).udt_name;
    if (!metaBySchema.has(key)) metaBySchema.set(key, new Map());
    metaBySchema.get(key)!.set(columnName, {
      is_nullable: typeof nullableRaw === 'string' ? nullableRaw : String(nullableRaw ?? ''),
      column_default:
        defRaw === null || defRaw === undefined ? null : typeof defRaw === 'string' ? defRaw : String(defRaw),
      data_type: typeof dataTypeRaw === 'string' ? dataTypeRaw : String(dataTypeRaw ?? ''),
      udt_name: typeof udtRaw === 'string' ? udtRaw : String(udtRaw ?? ''),
    });
  }

  if (bySchema.size === 0) {
    return {
      hasTable: false,
      tableRef: tableRefForSchema(preferredSchema),
      hasFullRecurrenceShape: false,
      hasRecurrenceTypeColumn: false,
      hasWeeklyDayColumn: false,
      hasStartsAtColumn: false,
      hasEndsAtColumn: false,
      columnNames: new Set(),
      columnMeta: new Map(),
    };
  }

  const chosenSchema =
    bySchema.has(preferredSchema) ? preferredSchema : bySchema.has('public') ? 'public' : Array.from(bySchema.keys())[0];
  const names = bySchema.get(chosenSchema) ?? new Set<string>();
  const hasRecurrenceTypeColumn = names.has('recurrence_type');
  const hasWeeklyDayColumn = names.has('weekly_day');
  const hasFullRecurrenceShape = hasRecurrenceTypeColumn && hasWeeklyDayColumn;
  const colMeta = metaBySchema.get(chosenSchema) ?? new Map<string, ColumnMeta>();
  return {
    hasTable: true,
    tableRef: tableRefForSchema(chosenSchema),
    hasFullRecurrenceShape,
    hasRecurrenceTypeColumn,
    hasWeeklyDayColumn,
    hasStartsAtColumn: names.has('starts_at'),
    hasEndsAtColumn: names.has('ends_at'),
    columnNames: names,
    columnMeta: colMeta,
  };
}

async function runChurchEventsDdlOnce(): Promise<void> {
  if (!churchEventsDdlOnce) {
    churchEventsDdlOnce = (async () => {
      try {
        const currentSchemaRes = await query('SELECT current_schema() AS schema_name');
        const currentSchema =
          (currentSchemaRes.rows[0] as { schema_name?: unknown } | undefined)?.schema_name;
        const targetSchema =
          typeof currentSchema === 'string' && currentSchema.trim() ? currentSchema : 'public';
        const targetTableRef = tableRefForSchema(targetSchema);

        await query(`
          CREATE TABLE IF NOT EXISTS ${targetTableRef} (
            id BIGSERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            event_date DATE NOT NULL,
            event_time TIME NOT NULL,
            recurrence_type VARCHAR(16) NOT NULL DEFAULT 'once' CHECK (recurrence_type IN ('once', 'weekly')),
            weekly_day SMALLINT CHECK (weekly_day BETWEEN 0 AND 6),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await query(`
          ALTER TABLE ${targetTableRef}
            ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(16),
            ADD COLUMN IF NOT EXISTS weekly_day SMALLINT
        `);
        await query(`
          UPDATE ${targetTableRef}
          SET recurrence_type = 'once'
          WHERE recurrence_type IS NULL OR recurrence_type NOT IN ('once', 'weekly')
        `);
        await query(`
          ALTER TABLE ${targetTableRef}
            ALTER COLUMN recurrence_type SET DEFAULT 'once',
            ALTER COLUMN recurrence_type SET NOT NULL
        `);
        await query(`
          ALTER TABLE ${targetTableRef}
            DROP CONSTRAINT IF EXISTS church_events_recurrence_type_check
        `);
        await query(`
          ALTER TABLE ${targetTableRef}
            ADD CONSTRAINT church_events_recurrence_type_check
            CHECK (recurrence_type IN ('once', 'weekly'))
        `);
        await query(`
          ALTER TABLE ${targetTableRef}
            DROP CONSTRAINT IF EXISTS church_events_weekly_day_check
        `);
        await query(`
          ALTER TABLE ${targetTableRef}
            ADD CONSTRAINT church_events_weekly_day_check
            CHECK (weekly_day IS NULL OR (weekly_day BETWEEN 0 AND 6))
        `);

        try {
          await query(`
            ALTER TABLE ${targetTableRef}
              DROP CONSTRAINT IF EXISTS church_events_category_check
          `);
        } catch (catCheckErr) {
          console.warn('[events] church_events_category_check drop skipped:', catCheckErr);
        }

        try {
          await query(`
            ALTER TABLE ${targetTableRef}
              ADD COLUMN IF NOT EXISTS description TEXT
          `);
          await query(`
            UPDATE ${targetTableRef}
            SET description = ''
            WHERE description IS NULL
          `);
          await query(`
            ALTER TABLE ${targetTableRef}
              ALTER COLUMN description SET DEFAULT ''
          `);
          await query(`
            ALTER TABLE ${targetTableRef}
              ALTER COLUMN description DROP NOT NULL
          `);
        } catch (descErr) {
          console.warn('[events] church_events description compatibility skipped:', descErr);
        }

        try {
          await query(`
            ALTER TABLE ${targetTableRef}
              ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ
          `);
        } catch (tsErr) {
          console.warn('[events] church_events starts_at column skipped:', tsErr);
        }
        try {
          await query(`
            ALTER TABLE ${targetTableRef}
              ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ
          `);
        } catch (tsErr) {
          console.warn('[events] church_events ends_at column skipped:', tsErr);
        }
        try {
          await query(`
            UPDATE ${targetTableRef}
            SET starts_at = event_date + event_time
            WHERE starts_at IS NULL
              AND event_date IS NOT NULL
              AND event_time IS NOT NULL
          `);
        } catch (tsErr) {
          console.warn('[events] church_events starts_at backfill skipped:', tsErr);
        }
        try {
          await query(`
            UPDATE ${targetTableRef}
            SET ends_at = starts_at + interval '2 hours'
            WHERE ends_at IS NULL
              AND starts_at IS NOT NULL
          `);
        } catch (tsErr) {
          console.warn('[events] church_events ends_at backfill skipped:', tsErr);
        }
        invalidateChurchEventsSchemaCache();
      } catch (err) {
        if (!isInsufficientPrivilegeError(err)) {
          throw err;
        }
        console.warn(
          '[events] No DDL permissions for church_events schema auto-fix; using available columns only.',
        );
      }
    })().catch((err) => {
      churchEventsDdlOnce = null;
      throw err;
    });
  }
  await churchEventsDdlOnce;
}

async function ensureChurchEventsSchema(): Promise<EventsSchemaState> {
  await runChurchEventsDdlOnce();
  const now = Date.now();
  if (churchEventsSchemaCache && now - churchEventsSchemaCache.loadedAt < SCHEMA_CACHE_TTL_MS) {
    return churchEventsSchemaCache.state;
  }
  const state = await readEventsSchemaState();
  if (!state.hasTable) {
    throw new Error('Table church_events does not exist and cannot be created with current DB role.');
  }
  churchEventsSchemaCache = { state, loadedAt: now };
  return state;
}

function assembleCreateInsert(
  state: EventsSchemaState,
  input: CreateChurchEventInput,
): { sql: string; params: unknown[] } {
  const names = state.columnNames;
  const meta = state.columnMeta;
  const cols: string[] = [];
  const vals: string[] = [];
  const params: unknown[] = [];
  let n = 0;
  const written = new Set<string>();

  const pushParam = (col: string, value: unknown, cast = '') => {
    if (!names.has(col)) return;
    n += 1;
    params.push(value);
    cols.push(quoteIdent(col));
    vals.push(cast ? `$${n}${cast}` : `$${n}`);
    written.add(col);
  };

  const pushSql = (col: string, sqlExpr: string) => {
    if (!names.has(col)) return;
    cols.push(quoteIdent(col));
    vals.push(sqlExpr);
    written.add(col);
  };

  pushParam('title', input.title.trim());
  pushParam('description', descriptionForInsert(input.description));
  pushParam('event_date', input.event_date, '::date');
  pushParam('event_time', input.event_time, '::time');

  if (names.has('recurrence_type')) {
    pushParam('recurrence_type', input.recurrence_type);
  }
  if (names.has('weekly_day')) {
    pushParam(
      'weekly_day',
      input.recurrence_type === 'weekly' ? input.weekly_day ?? null : null,
    );
  }
  if (names.has('is_active')) {
    n += 1;
    params.push(input.is_active ?? true);
    cols.push(quoteIdent('is_active'));
    vals.push(`COALESCE($${n}, TRUE)`);
    written.add('is_active');
  }

  if (names.has('category')) {
    const raw = input.category != null ? String(input.category).trim() : '';
    const c = raw || defaultChurchEventCategory();
    pushParam('category', c);
  }

  const startAt = '($3::date + $4::time)';
  if (names.has('starts_at')) {
    pushSql('starts_at', startAt);
  }
  if (names.has('ends_at')) {
    pushSql('ends_at', `(${startAt} + interval '2 hours')`);
  }

  const gap = computeLegacyNotNullGap(meta, written);
  const extra = buildExtraInsertSql(gap, n + 1);
  const returning = selectEventProjection(state);

  const sql = `INSERT INTO ${state.tableRef} (${cols.join(', ')}${extra.columns})
       VALUES (${vals.join(', ')}${extra.valuesSql})
       RETURNING ${returning}`;

  return { sql, params: [...params, ...extra.params] };
}

function rowToChurchEvent(row: unknown): ChurchEvent {
  if (!row || typeof row !== 'object') {
    throw new Error('church_events query returned no row');
  }
  const r = row as Record<string, unknown>;
  const idRaw = r.id;
  const id =
    typeof idRaw === 'bigint'
      ? Number(idRaw)
      : typeof idRaw === 'string'
        ? Number(idRaw)
        : Number(idRaw);
  if (!Number.isFinite(id)) {
    throw new Error('church_events row has invalid id');
  }
  const wd = r.weekly_day;
  let weeklyDay: number | null = null;
  if (wd !== null && wd !== undefined && wd !== '') {
    const n = Number(wd);
    if (Number.isInteger(n) && n >= 0 && n <= 6) {
      weeklyDay = n;
    }
  }
  const rt = r.recurrence_type === 'weekly' ? 'weekly' : 'once';
  const ca = r.created_at;
  const ua = r.updated_at;
  const cat = r.category;
  const out: ChurchEvent = {
    id,
    title: String(r.title ?? ''),
    description: r.description === null || r.description === undefined ? null : String(r.description),
    event_date: String(r.event_date ?? ''),
    event_time: String(r.event_time ?? ''),
    recurrence_type: rt,
    weekly_day: weeklyDay,
    is_active: Boolean(r.is_active),
    created_at: ca instanceof Date ? ca.toISOString() : String(ca ?? ''),
    updated_at: ua instanceof Date ? ua.toISOString() : String(ua ?? ''),
  };
  if (cat !== undefined) {
    out.category = cat === null ? null : String(cat);
  }
  return out;
}

export async function listActiveEvents(): Promise<ChurchEvent[]> {
  const schema = await ensureChurchEventsSchema();
  const result = await query(
    `SELECT
      ${selectEventProjection(schema)}
     FROM ${schema.tableRef}
     WHERE is_active = TRUE
     ORDER BY event_date ASC, event_time ASC, id ASC`,
  );
  return result.rows.map(rowToChurchEvent);
}

export async function listAllEventsAdmin(): Promise<ChurchEvent[]> {
  const schema = await ensureChurchEventsSchema();
  const result = await query(
    `SELECT
      ${selectEventProjection(schema)}
     FROM ${schema.tableRef}
     ORDER BY event_date ASC, event_time ASC, id ASC`,
  );
  return result.rows.map(rowToChurchEvent);
}

export async function createChurchEvent(input: CreateChurchEventInput): Promise<ChurchEvent> {
  const tryInsert = async () => {
    const schema = await ensureChurchEventsSchema();
    const { sql, params } = assembleCreateInsert(schema, input);
    return await query(sql, params);
  };

  let result;
  try {
    result = await tryInsert();
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
    if (code === '42703' || code === '42P01') {
      invalidateChurchEventsSchemaCache();
      result = await tryInsert();
    } else {
      throw err;
    }
  }

  const inserted = result.rows[0];
  if (!inserted) {
    throw new Error('church_events INSERT returned no row');
  }
  return rowToChurchEvent(inserted);
}

export async function updateChurchEvent(
  id: number,
  input: Partial<{
    title: string;
    description: string | null;
    event_date: string;
    event_time: string;
    recurrence_type: 'once' | 'weekly';
    weekly_day: number | null;
    is_active: boolean;
    category: string | null;
  }>,
): Promise<ChurchEvent | null> {
  const schema = await ensureChurchEventsSchema();
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (typeof input.title === 'string') {
    updates.push(`title = $${i++}`);
    values.push(input.title.trim());
  }
  if (input.description !== undefined) {
    updates.push(`description = $${i++}`);
    values.push(descriptionForInsert(input.description ?? ''));
  }
  if (typeof input.event_date === 'string') {
    updates.push(`event_date = $${i++}::date`);
    values.push(input.event_date);
  }
  if (typeof input.event_time === 'string') {
    updates.push(`event_time = $${i++}::time`);
    values.push(input.event_time);
  }
  if (schema.hasRecurrenceTypeColumn && typeof input.recurrence_type === 'string') {
    updates.push(`recurrence_type = $${i++}`);
    values.push(input.recurrence_type);
  }
  if (schema.hasWeeklyDayColumn && input.weekly_day !== undefined) {
    updates.push(`weekly_day = $${i++}`);
    values.push(input.weekly_day);
  }
  if (typeof input.is_active === 'boolean') {
    updates.push(`is_active = $${i++}`);
    values.push(input.is_active);
  }
  if (schema.columnNames.has('category') && input.category !== undefined) {
    const catMeta = schema.columnMeta.get('category');
    const raw = input.category;
    const wantsClear = raw === null || String(raw).trim() === '';
    if (wantsClear) {
      if (!catMeta || catMeta.is_nullable === 'YES') {
        updates.push(`category = $${i++}`);
        values.push(null);
      } else if (hasDbDefault(catMeta)) {
        updates.push('category = DEFAULT');
      } else {
        updates.push(`category = $${i++}`);
        values.push(defaultChurchEventCategory());
      }
    } else {
      updates.push(`category = $${i++}`);
      values.push(String(raw).trim());
    }
  }

  if (
    (schema.hasStartsAtColumn || schema.hasEndsAtColumn) &&
    (typeof input.event_date === 'string' || typeof input.event_time === 'string')
  ) {
    const cur = await query(
      `SELECT event_date::text AS event_date, to_char(event_time, 'HH24:MI') AS event_time
       FROM ${schema.tableRef} WHERE id = $1`,
      [id],
    );
    const row = cur.rows[0] as { event_date: string; event_time: string } | undefined;
    if (!row) {
      return null;
    }
    const d = typeof input.event_date === 'string' ? input.event_date : row.event_date;
    const tm = typeof input.event_time === 'string' ? input.event_time : row.event_time;
    const pi = i;
    if (schema.hasStartsAtColumn) {
      updates.push(`starts_at = $${pi}::date + $${pi + 1}::time`);
    }
    if (schema.hasEndsAtColumn) {
      updates.push(`ends_at = $${pi}::date + $${pi + 1}::time + interval '2 hours'`);
    }
    values.push(d, tm);
    i += 2;
  }

  if (updates.length === 0) {
    const current = await query(
      `SELECT
        ${selectEventProjection(schema)}
       FROM ${schema.tableRef}
       WHERE id = $1`,
      [id],
    );
    const curRow = current.rows[0];
    return curRow ? rowToChurchEvent(curRow) : null;
  }

  updates.push('updated_at = NOW()');
  values.push(id);
  const result = await query(
    `UPDATE ${schema.tableRef}
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING
       ${selectEventProjection(schema)}`,
    values,
  );
  const upd = result.rows[0];
  return upd ? rowToChurchEvent(upd) : null;
}

export async function deleteChurchEvent(id: number): Promise<boolean> {
  const schema = await ensureChurchEventsSchema();
  const result = await query(`DELETE FROM ${schema.tableRef} WHERE id = $1 RETURNING id`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllChurchEvents(): Promise<number> {
  const schema = await ensureChurchEventsSchema();
  const result = await query(`DELETE FROM ${schema.tableRef}`);
  return result.rowCount ?? 0;
}
