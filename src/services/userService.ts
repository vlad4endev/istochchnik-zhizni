import { query } from '../config/db';
import { getPrayerDataByDate } from './calendarService';
import { getCurrentCycleIndexForUpsert, upsertMemberPrayerForCycle } from './prayerCycleService';

export interface AppUser {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  phone_number: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  prayer_request: string | null;
  birth_date: string | null;
  email: string | null;
  account_provider: string | null;
  account_id: string | null;
  is_active: boolean;
  app_role: 'member' | 'admin';
  /** Ответственный за сбор — может назначать участников на дни следующей недели. */
  is_collection_coordinator: boolean;
  /** Есть пароль для входа в приложение (прошёл регистрацию). */
  has_registered: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  first_name: string;
  last_name: string;
  phone_number: string;
  ministry_role?: string;
  ministry_direction?: string;
  prayer_request?: string;
  birth_date?: string;
  email?: string;
  account_provider?: string;
  account_id?: string;
  is_active?: boolean;
  app_role?: 'member' | 'admin';
  is_collection_coordinator?: boolean;
}

export interface UpdateUserInput {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  ministry_role?: string;
  ministry_direction?: string;
  prayer_request?: string;
  birth_date?: string;
  email?: string;
  account_provider?: string;
  account_id?: string;
  is_active?: boolean;
  app_role?: 'member' | 'admin';
  is_collection_coordinator?: boolean;
}

export interface LinkAccountInput {
  account_provider: string;
  account_id: string;
}

export type AppRole = 'member' | 'admin';

export class MemberNameDuplicateError extends Error {
  constructor(
    message = 'Участник с таким именем и фамилией уже есть'
  ) {
    super(message);
    this.name = 'MemberNameDuplicateError';
  }
}

/**
 * Ищет другого участника с тем же именем и фамилией (без учёта регистра и лишних пробелов)
 * или с тем же полным именем в колонке `name` («Имя Фамилия» / «Фамилия Имя» для старых записей).
 */
export async function findMemberIdConflictingName(
  firstName: string,
  lastName: string,
  excludeMemberId?: number
): Promise<number | null> {
  const fn = firstName.trim();
  const ln = lastName.trim();
  if (!fn || !ln) {
    return null;
  }
  const fullDirect = `${fn} ${ln}`.trim();
  const fullReverse = `${ln} ${fn}`.trim();

  const result = await query(
    `SELECT id FROM members
     WHERE ($3::INTEGER IS NULL OR id <> $3)
       AND (
         (
           TRIM(COALESCE(first_name, '')) <> ''
           AND TRIM(COALESCE(last_name, '')) <> ''
           AND LOWER(TRIM(first_name)) = LOWER($1)
           AND LOWER(TRIM(last_name)) = LOWER($2)
         )
         OR (
           LOWER(regexp_replace(TRIM(COALESCE(name, '')), '\\s+', ' ', 'g'))
             = LOWER(regexp_replace(TRIM($4), '\\s+', ' ', 'g'))
         )
         OR (
           LOWER(regexp_replace(TRIM(COALESCE(name, '')), '\\s+', ' ', 'g'))
             = LOWER(regexp_replace(TRIM($5), '\\s+', ' ', 'g'))
         )
       )
     LIMIT 1`,
    [fn, ln, excludeMemberId ?? null, fullDirect, fullReverse]
  );

  const row = result.rows[0] as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

export interface PrayerCycleStartResult {
  requested_date: string;
  start_date: string;
}

export interface OneTimeMemberDateOverrideResult {
  target_date: string;
  member_id: number;
}

export interface MinistryRoleTemplate {
  id: number;
  title: string;
  created_at: string;
}

export interface MinistryDirectionTemplate {
  id: number;
  title: string;
  created_at: string;
}

export interface PrayerRequestHistoryItem {
  id: number;
  member_id: number;
  prayer_request: string;
  /** Индекс молитвенного цикла на момент сохранения (если есть в БД). */
  cycle_index: number | null;
  created_at: string;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapUser(row: AppUser): AppUser {
  return row;
}

async function appendPrayerRequestHistory(
  memberId: number,
  prayerRequest: string,
  cycleIndex: number
): Promise<void> {
  const normalized = prayerRequest.trim();
  if (!normalized) {
    return;
  }

  await query(
    `INSERT INTO member_prayer_request_history (member_id, prayer_request, cycle_index)
     VALUES ($1, $2, $3)`,
    [memberId, normalized, cycleIndex]
  );
}

async function resetCycleStartToCurrentDate(): Promise<void> {
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, current_date)
     ON CONFLICT (id)
     DO UPDATE SET start_date = EXCLUDED.start_date`
  );
}

export async function listUsers(): Promise<AppUser[]> {
  const ci = await getCurrentCycleIndexForUpsert();
  const result = await query(
    `SELECT
      m.id,
      m.first_name,
      m.last_name,
      m.name,
      m.phone_number,
      m.ministry_role,
      m.ministry_direction,
      COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
      m.birth_date,
      m.email,
      m.account_provider,
      m.account_id,
      m.is_active,
      m.app_role,
      m.is_collection_coordinator,
      (m.password_hash IS NOT NULL) AS has_registered,
      m.created_at,
      m.updated_at
    FROM members m
    LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = $1
    ORDER BY m.id DESC`,
    [ci]
  );
  return result.rows.map(mapUser);
}

export async function getUserById(id: number): Promise<AppUser | null> {
  const ci = await getCurrentCycleIndexForUpsert();
  const result = await query(
    `SELECT
      m.id,
      m.first_name,
      m.last_name,
      m.name,
      m.phone_number,
      m.ministry_role,
      m.ministry_direction,
      COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
      m.birth_date,
      m.email,
      m.account_provider,
      m.account_id,
      m.is_active,
      m.app_role,
      m.is_collection_coordinator,
      (m.password_hash IS NOT NULL) AS has_registered,
      m.created_at,
      m.updated_at
    FROM members m
    LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = $2
    WHERE m.id = $1`,
    [id, ci]
  );

  return result.rows[0] ? mapUser(result.rows[0] as AppUser) : null;
}

export async function createUser(input: CreateUserInput): Promise<AppUser> {
  const dupId = await findMemberIdConflictingName(input.first_name, input.last_name);
  if (dupId !== null) {
    throw new MemberNameDuplicateError();
  }

  const result = await query(
    `INSERT INTO members
      (first_name, last_name, name, phone_number, ministry_role, ministry_direction, prayer_request, birth_date, email, account_provider, account_id, is_active, app_role, is_collection_coordinator, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, TRUE), COALESCE($13, 'member'), COALESCE($14, FALSE), NOW())
    RETURNING
      id,
      first_name,
      last_name,
      name,
      phone_number,
      ministry_role,
      ministry_direction,
      prayer_request,
      birth_date,
      email,
      account_provider,
      account_id,
      is_active,
      app_role,
      is_collection_coordinator,
      (password_hash IS NOT NULL) AS has_registered,
      created_at,
      updated_at`,
    [
      input.first_name.trim(),
      input.last_name.trim(),
      `${input.first_name.trim()} ${input.last_name.trim()}`.trim(),
      normalizeOptionalString(input.phone_number),
      normalizeOptionalString(input.ministry_role),
      normalizeOptionalString(input.ministry_direction),
      normalizeOptionalString(input.prayer_request),
      normalizeOptionalString(input.birth_date),
      normalizeOptionalString(input.email),
      normalizeOptionalString(input.account_provider),
      normalizeOptionalString(input.account_id),
      input.is_active ?? true,
      input.app_role ?? 'member',
      input.is_collection_coordinator ?? false,
    ]
  );

  const created = mapUser(result.rows[0] as AppUser);
  const prayerRequest = (created.prayer_request ?? '').trim();
  const ci = await getCurrentCycleIndexForUpsert();
  if (prayerRequest.length > 0) {
    await upsertMemberPrayerForCycle(created.id, ci, prayerRequest);
    await appendPrayerRequestHistory(created.id, prayerRequest, ci);
  }

  return created;
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<AppUser | null> {
  let previousPrayerRequest: string | null = null;
  const hasPrayerRequestUpdate = typeof input.prayer_request === 'string';
  if (hasPrayerRequestUpdate) {
    const existing = await getUserById(id);
    if (!existing) {
      return null;
    }
    previousPrayerRequest = (existing.prayer_request ?? '').trim() || null;
  }

  if (typeof input.first_name === 'string' || typeof input.last_name === 'string') {
    const existing = await getUserById(id);
    if (!existing) {
      return null;
    }
    const effFirst =
      typeof input.first_name === 'string'
        ? input.first_name.trim()
        : (existing.first_name ?? '').trim();
    const effLast =
      typeof input.last_name === 'string'
        ? input.last_name.trim()
        : (existing.last_name ?? '').trim();
    if (effFirst && effLast) {
      const dupId = await findMemberIdConflictingName(effFirst, effLast, id);
      if (dupId !== null) {
        throw new MemberNameDuplicateError();
      }
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof input.first_name === 'string') {
    updates.push(`first_name = $${values.length + 1}`);
    values.push(input.first_name.trim());
  }

  if (typeof input.last_name === 'string') {
    updates.push(`last_name = $${values.length + 1}`);
    values.push(input.last_name.trim());
  }

  if (typeof input.first_name === 'string' && typeof input.last_name === 'string') {
    updates.push(`name = $${values.length + 1}`);
    values.push(`${input.first_name.trim()} ${input.last_name.trim()}`.trim());
  }

  if (typeof input.phone_number === 'string') {
    updates.push(`phone_number = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.phone_number));
  }

  if (typeof input.ministry_role === 'string') {
    updates.push(`ministry_role = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.ministry_role));
  }

  if (typeof input.ministry_direction === 'string') {
    updates.push(`ministry_direction = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.ministry_direction));
  }

  if (typeof input.prayer_request === 'string') {
    updates.push(`prayer_request = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.prayer_request));
  }

  if (typeof input.birth_date === 'string') {
    updates.push(`birth_date = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.birth_date));
  }

  if (typeof input.email === 'string') {
    updates.push(`email = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.email));
  }

  if (typeof input.account_provider === 'string') {
    updates.push(`account_provider = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.account_provider));
  }

  if (typeof input.account_id === 'string') {
    updates.push(`account_id = $${values.length + 1}`);
    values.push(normalizeOptionalString(input.account_id));
  }

  if (typeof input.is_active === 'boolean') {
    updates.push(`is_active = $${values.length + 1}`);
    values.push(input.is_active);
  }

  if (typeof input.app_role === 'string') {
    updates.push(`app_role = $${values.length + 1}`);
    values.push(input.app_role);
  }

  if (typeof input.is_collection_coordinator === 'boolean') {
    updates.push(`is_collection_coordinator = $${values.length + 1}`);
    values.push(input.is_collection_coordinator);
  }

  if (updates.length === 0) {
    return getUserById(id);
  }

  updates.push('updated_at = NOW()');
  values.push(id);

  const result = await query(
    `UPDATE members
    SET ${updates.join(', ')}
    WHERE id = $${values.length}
    RETURNING
      id,
      first_name,
      last_name,
      name,
      phone_number,
      ministry_role,
      ministry_direction,
      prayer_request,
      birth_date,
      email,
      account_provider,
      account_id,
      is_active,
      app_role,
      is_collection_coordinator,
      (password_hash IS NOT NULL) AS has_registered,
      created_at,
      updated_at`,
    values
  );

  const updated = result.rows[0] ? mapUser(result.rows[0] as AppUser) : null;
  if (!updated) {
    return null;
  }

  if (hasPrayerRequestUpdate) {
    const nextPrayerRequest = (updated.prayer_request ?? '').trim();
    const prevPrayerRequest = previousPrayerRequest ?? '';
    const ci = await getCurrentCycleIndexForUpsert();
    await upsertMemberPrayerForCycle(id, ci, normalizeOptionalString(input.prayer_request));
    if (nextPrayerRequest.length > 0 && nextPrayerRequest !== prevPrayerRequest) {
      await appendPrayerRequestHistory(id, nextPrayerRequest, ci);
    }
  }

  return updated;
}

export async function deleteUser(id: number): Promise<boolean> {
  const result = await query('DELETE FROM members WHERE id = $1', [id]);
  const isDeleted = (result.rowCount ?? 0) > 0;
  if (isDeleted) {
    await resetCycleStartToCurrentDate();
  }
  return isDeleted;
}

export async function linkUserAccount(id: number, input: LinkAccountInput): Promise<AppUser | null> {
  const result = await query(
    `UPDATE members
     SET account_provider = $1, account_id = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING
      id,
      first_name,
      last_name,
      name,
      phone_number,
      ministry_role,
      ministry_direction,
      prayer_request,
      birth_date,
      email,
      account_provider,
      account_id,
      is_active,
      app_role,
      is_collection_coordinator,
      (password_hash IS NOT NULL) AS has_registered,
      created_at,
      updated_at`,
    [input.account_provider.trim(), input.account_id.trim(), id]
  );

  return result.rows[0] ? mapUser(result.rows[0] as AppUser) : null;
}

export async function setUserAppRole(id: number, appRole: AppRole): Promise<AppUser | null> {
  const currentUser = await getUserById(id);
  if (!currentUser) {
    return null;
  }

  if (currentUser.app_role === 'admin' && appRole === 'member') {
    const adminsCount = await query(
      `SELECT COUNT(*)::int AS count
       FROM members
       WHERE app_role = 'admin' AND is_active = TRUE`
    );
    const totalAdmins = adminsCount.rows[0]?.count ?? 0;
    if (totalAdmins <= 1) {
      throw new Error('Cannot remove the last active administrator');
    }
  }

  const result = await query(
    `UPDATE members
     SET app_role = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING
      id,
      first_name,
      last_name,
      name,
      phone_number,
      ministry_role,
      ministry_direction,
      prayer_request,
      birth_date,
      email,
      account_provider,
      account_id,
      is_active,
      app_role,
      is_collection_coordinator,
      (password_hash IS NOT NULL) AS has_registered,
      created_at,
      updated_at`,
    [appRole, id]
  );

  return result.rows[0] ? mapUser(result.rows[0] as AppUser) : null;
}

function normalizeIsoDate(dateInput: string): string {
  const date = new Date(`${dateInput}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid start date');
  }
  return date.toISOString().slice(0, 10);
}

export async function startPrayerCycle(dateInput: string): Promise<PrayerCycleStartResult> {
  const normalizedRequestedDate = dateInput.trim();
  const startDate = normalizeIsoDate(normalizedRequestedDate);

  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, $1::date)
     ON CONFLICT (id)
     DO UPDATE SET start_date = EXCLUDED.start_date`,
    [startDate]
  );

  return {
    requested_date: normalizedRequestedDate,
    start_date: startDate,
  };
}

export async function setOneTimeMemberDateOverride(
  memberId: number,
  targetDate: string
): Promise<OneTimeMemberDateOverrideResult> {
  const member = await getUserById(memberId);
  if (!member) {
    throw new Error('User not found');
  }

  await query(
    `INSERT INTO member_cycle_overrides (target_date, member_id)
     VALUES ($1::date, $2)
     ON CONFLICT (target_date)
     DO UPDATE SET member_id = EXCLUDED.member_id, updated_at = NOW()`,
    [targetDate.trim(), memberId]
  );

  return {
    target_date: targetDate.trim(),
    member_id: memberId,
  };
}

export async function listMinistryRoleTemplates(): Promise<MinistryRoleTemplate[]> {
  const result = await query(
    `SELECT id, title, created_at
     FROM ministry_role_templates
     ORDER BY title ASC`
  );

  return result.rows as MinistryRoleTemplate[];
}

export async function createMinistryRoleTemplate(title: string): Promise<MinistryRoleTemplate> {
  const result = await query(
    `INSERT INTO ministry_role_templates (title)
     VALUES ($1)
     RETURNING id, title, created_at`,
    [title.trim()]
  );

  return result.rows[0] as MinistryRoleTemplate;
}

export async function deleteMinistryRoleTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM ministry_role_templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listMinistryDirectionTemplates(): Promise<MinistryDirectionTemplate[]> {
  const result = await query(
    `SELECT id, title, created_at
     FROM ministry_direction_templates
     ORDER BY title ASC`
  );

  return result.rows as MinistryDirectionTemplate[];
}

export async function createMinistryDirectionTemplate(
  title: string
): Promise<MinistryDirectionTemplate> {
  const result = await query(
    `INSERT INTO ministry_direction_templates (title)
     VALUES ($1)
     RETURNING id, title, created_at`,
    [title.trim()]
  );

  return result.rows[0] as MinistryDirectionTemplate;
}

export async function deleteMinistryDirectionTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM ministry_direction_templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Сохранение молитвенной нужды для участника на конкретную дату цикла (координатор / админ).
 * Пишет member_prayer_by_cycle и при изменении текста — запись в member_prayer_request_history.
 */
export async function setCoordinatorPrayerNeedForDate(
  memberId: number,
  targetDate: string,
  prayerRequest: string | null
): Promise<void> {
  const data = await getPrayerDataByDate(targetDate);
  const assigned = data.members[0];
  if (!assigned || assigned.id !== memberId) {
    throw new Error('member_mismatch');
  }
  const ci = data.prayer_cycle?.index;
  if (ci === undefined) {
    throw new Error('no_cycle');
  }
  const prev = (assigned.prayer_request ?? '').trim();
  const normalized = normalizeOptionalString(prayerRequest);
  await upsertMemberPrayerForCycle(memberId, ci, normalized);
  const next = (normalized ?? '').trim();
  if (next.length > 0 && next !== prev) {
    await appendPrayerRequestHistory(memberId, next, ci);
  }
}

export async function listPrayerRequestHistory(
  memberId: number,
  limit = 20
): Promise<PrayerRequestHistoryItem[]> {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
  const result = await query(
    `SELECT id, member_id, prayer_request, cycle_index, created_at
     FROM member_prayer_request_history
     WHERE member_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [memberId, safeLimit]
  );
  return result.rows as PrayerRequestHistoryItem[];
}
