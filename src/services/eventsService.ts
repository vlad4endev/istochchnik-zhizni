import { query } from '../config/db';

export interface ChurchEvent {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type EventsSchemaState = {
  hasTable: boolean;
  tableRef: string;
  /** Есть оба столбца — полный SELECT/RETURNING как в актуальной схеме */
  hasFullRecurrenceShape: boolean;
  /** Только recurrence_type (без weekly_day) — иначе INSERT без recurrence ломает NOT NULL */
  hasRecurrenceTypeColumn: boolean;
  hasWeeklyDayColumn: boolean;
  /** Чужая схема (Supabase и т.д.): NOT NULL без значения в нашем INSERT */
  hasStartsAtColumn: boolean;
  hasEndsAtColumn: boolean;
};

/** DDL для church_events — один раз за процесс (идемпотентно). Снимок колонок не кэшируем: после миграций БД старый кэш ломал INSERT. */
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

/** Supabase/legacy: starts_at / ends_at NOT NULL — заполняем из тех же $3 date и $4 time, что и event_date/event_time. */
function insertTimestampExtras(schema: EventsSchemaState): { columns: string; valuesSql: string } {
  const startAt = '($3::date + $4::time)';
  if (schema.hasStartsAtColumn && schema.hasEndsAtColumn) {
    return {
      columns: ', starts_at, ends_at',
      valuesSql: `, ${startAt}, (${startAt} + interval '2 hours')`,
    };
  }
  if (schema.hasStartsAtColumn) {
    return { columns: ', starts_at', valuesSql: `, ${startAt}` };
  }
  if (schema.hasEndsAtColumn) {
    return {
      columns: ', ends_at',
      valuesSql: `, (${startAt} + interval '2 hours')`,
    };
  }
  return { columns: '', valuesSql: '' };
}

function selectEventProjection(schema: Pick<EventsSchemaState, 'hasFullRecurrenceShape' | 'hasRecurrenceTypeColumn'>): string {
  const descExpr = `NULLIF(BTRIM(description), '') AS description`;
  if (schema.hasFullRecurrenceShape) {
    return `
      id,
      title,
      ${descExpr},
      event_date::text AS event_date,
      to_char(event_time, 'HH24:MI') AS event_time,
      recurrence_type,
      weekly_day,
      is_active,
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
      is_active,
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
      is_active,
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
    `SELECT table_schema, column_name
     FROM information_schema.columns
     WHERE table_name = 'church_events'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
  );
  const bySchema = new Map<string, Set<string>>();
  for (const row of columns.rows) {
    const tableSchema = (row as { table_schema?: unknown }).table_schema;
    const columnName = (row as { column_name?: unknown }).column_name;
    if (typeof tableSchema !== 'string' || typeof columnName !== 'string') continue;
    const key = tableSchema.trim();
    if (!key) continue;
    if (!bySchema.has(key)) bySchema.set(key, new Set<string>());
    bySchema.get(key)!.add(columnName);
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
    };
  }

  const chosenSchema =
    bySchema.has(preferredSchema) ? preferredSchema : bySchema.has('public') ? 'public' : Array.from(bySchema.keys())[0];
  const names = bySchema.get(chosenSchema) ?? new Set<string>();
  const hasRecurrenceTypeColumn = names.has('recurrence_type');
  const hasWeeklyDayColumn = names.has('weekly_day');
  const hasFullRecurrenceShape = hasRecurrenceTypeColumn && hasWeeklyDayColumn;
  return {
    hasTable: true,
    tableRef: tableRefForSchema(chosenSchema),
    hasFullRecurrenceShape,
    hasRecurrenceTypeColumn,
    hasWeeklyDayColumn,
    hasStartsAtColumn: names.has('starts_at'),
    hasEndsAtColumn: names.has('ends_at'),
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
              ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ
          `);
          await query(`
            UPDATE ${targetTableRef}
            SET starts_at = event_date + event_time
            WHERE starts_at IS NULL
              AND event_date IS NOT NULL
              AND event_time IS NOT NULL
          `);
          await query(`
            UPDATE ${targetTableRef}
            SET ends_at = starts_at + interval '2 hours'
            WHERE ends_at IS NULL
              AND starts_at IS NOT NULL
          `);
        } catch (tsErr) {
          console.warn('[events] church_events starts_at/ends_at backfill skipped:', tsErr);
        }
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
  const state = await readEventsSchemaState();
  if (!state.hasTable) {
    throw new Error('Table church_events does not exist and cannot be created with current DB role.');
  }
  return state;
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
  return {
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

export async function createChurchEvent(input: {
  title: string;
  description?: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day?: number | null;
  is_active?: boolean;
}): Promise<ChurchEvent> {
  const schema = await ensureChurchEventsSchema();
  const title = input.title.trim();
  const description = descriptionForInsert(input.description);
  const isActive = input.is_active ?? true;
  const returning = selectEventProjection(schema);
  const ts = insertTimestampExtras(schema);

  let result;
  if (schema.hasFullRecurrenceShape) {
    result = await query(
      `INSERT INTO ${schema.tableRef} (title, description, event_date, event_time, recurrence_type, weekly_day, is_active${ts.columns})
       VALUES ($1, $2, $3::date, $4::time, $5, $6, COALESCE($7, TRUE)${ts.valuesSql})
       RETURNING ${returning}`,
      [
        title,
        description,
        input.event_date,
        input.event_time,
        input.recurrence_type,
        input.weekly_day ?? null,
        isActive,
      ],
    );
  } else if (schema.hasRecurrenceTypeColumn) {
    result = await query(
      `INSERT INTO ${schema.tableRef} (title, description, event_date, event_time, recurrence_type, is_active${ts.columns})
       VALUES ($1, $2, $3::date, $4::time, $5, COALESCE($6, TRUE)${ts.valuesSql})
       RETURNING ${returning}`,
      [title, description, input.event_date, input.event_time, input.recurrence_type, isActive],
    );
  } else {
    result = await query(
      `INSERT INTO ${schema.tableRef} (title, description, event_date, event_time, is_active${ts.columns})
       VALUES ($1, $2, $3::date, $4::time, COALESCE($5, TRUE)${ts.valuesSql})
       RETURNING ${returning}`,
      [title, description, input.event_date, input.event_time, isActive],
    );
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
