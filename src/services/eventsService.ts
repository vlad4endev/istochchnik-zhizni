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
};

let schemaStateOnce: Promise<EventsSchemaState> | null = null;

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
  };
}

async function ensureChurchEventsSchema(): Promise<EventsSchemaState> {
  if (!schemaStateOnce) {
    schemaStateOnce = (async () => {
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
      } catch (err) {
        if (!isInsufficientPrivilegeError(err)) {
          throw err;
        }
        console.warn(
          '[events] No DDL permissions for church_events schema auto-fix; using available columns only.',
        );
      }

      const state = await readEventsSchemaState();
      if (!state.hasTable) {
        throw new Error('Table church_events does not exist and cannot be created with current DB role.');
      }
      return state;
    })().catch((err) => {
      schemaStateOnce = null;
      throw err;
    });
  }
  return await schemaStateOnce;
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
  return result.rows as ChurchEvent[];
}

export async function listAllEventsAdmin(): Promise<ChurchEvent[]> {
  const schema = await ensureChurchEventsSchema();
  const result = await query(
    `SELECT
      ${selectEventProjection(schema)}
     FROM ${schema.tableRef}
     ORDER BY event_date ASC, event_time ASC, id ASC`,
  );
  return result.rows as ChurchEvent[];
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

  let result;
  if (schema.hasFullRecurrenceShape) {
    result = await query(
      `INSERT INTO ${schema.tableRef} (title, description, event_date, event_time, recurrence_type, weekly_day, is_active)
       VALUES ($1, $2, $3::date, $4::time, $5, $6, COALESCE($7, TRUE))
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
      `INSERT INTO ${schema.tableRef} (title, description, event_date, event_time, recurrence_type, is_active)
       VALUES ($1, $2, $3::date, $4::time, $5, COALESCE($6, TRUE))
       RETURNING ${returning}`,
      [title, description, input.event_date, input.event_time, input.recurrence_type, isActive],
    );
  } else {
    result = await query(
      `INSERT INTO ${schema.tableRef} (title, description, event_date, event_time, is_active)
       VALUES ($1, $2, $3::date, $4::time, COALESCE($5, TRUE))
       RETURNING ${returning}`,
      [title, description, input.event_date, input.event_time, isActive],
    );
  }
  return result.rows[0] as ChurchEvent;
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

  if (updates.length === 0) {
    const current = await query(
      `SELECT
        ${selectEventProjection(schema)}
       FROM ${schema.tableRef}
       WHERE id = $1`,
      [id],
    );
    return (current.rows[0] as ChurchEvent | undefined) ?? null;
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
  return (result.rows[0] as ChurchEvent | undefined) ?? null;
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
