import { query } from '../config/db';
import type { AppRole } from '../types/appRole';
import { mergeAppRoles, normalizeAppRole } from '../types/appRole';
import { getPrayerDataByDate } from './calendarService';
import { getCurrentCycleIndexForUpsert, upsertMemberPrayerForCycle } from './prayerCycleService';

export interface AppUser {
  id: number;
  /** Публичный UUID, стабильный при жизни записи (не числовой id). */
  user_id: string;
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
  app_role: AppRole;
  /** Ответственный за сбор — может назначать участников на дни следующей недели. */
  is_collection_coordinator: boolean;
  /** Участвует в общем молитвенном цикле (очередь по дням). */
  in_prayer_cycle: boolean;
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
  app_role?: AppRole;
  is_collection_coordinator?: boolean;
  merge_if_duplicate?: boolean;
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
  app_role?: AppRole;
  is_collection_coordinator?: boolean;
  in_prayer_cycle?: boolean;
}

export interface LinkAccountInput {
  account_provider: string;
  account_id: string;
}

export type { AppRole } from '../types/appRole';

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

export interface MinistryDirectionTemplateWithRoles extends MinistryDirectionTemplate {
  roles: MinistryRoleTemplate[];
}

export interface PrayerRequestHistoryItem {
  id: number;
  member_id: number;
  prayer_request: string;
  /** Индекс молитвенного цикла на момент сохранения (если есть в БД). */
  cycle_index: number | null;
  /** Дата, когда за участника молились в этом цикле. Вычисляется на бэкенде. */
  prayed_on_date?: string | null;
  created_at: string;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapUser(row: AppUser & { user_id?: unknown; app_role?: unknown }): AppUser {
  const uid = row.user_id;
  return {
    ...row,
    user_id: uid != null && String(uid).trim() !== '' ? String(uid) : '',
    app_role: normalizeAppRole(row.app_role),
  };
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
      m.user_id,
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
      m.in_prayer_cycle,
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
      m.user_id,
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
      m.in_prayer_cycle,
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

/**
 * Меняет местами значения `first_name` и `last_name` и пересобирает `name` («Имя Фамилия»).
 * Для исправления записей, где колонки были заполнены наоборот.
 */
export async function swapMemberFirstLastName(id: number): Promise<AppUser | null> {
  const existing = await getUserById(id);
  if (!existing) {
    return null;
  }
  const fn = (existing.first_name ?? '').trim();
  const ln = (existing.last_name ?? '').trim();
  if (!fn && !ln) {
    return existing;
  }

  const newFirst = ln;
  const newLast = fn;
  if (newFirst && newLast) {
    const dupId = await findMemberIdConflictingName(newFirst, newLast, id);
    if (dupId !== null) {
      throw new MemberNameDuplicateError();
    }
  }

  const nameVal = `${newFirst} ${newLast}`.trim();
  await query(
    `UPDATE members
     SET first_name = $1, last_name = $2, name = $3, updated_at = NOW()
     WHERE id = $4`,
    [newFirst, newLast, nameVal || existing.name, id]
  );

  return getUserById(id);
}

/** Массово меняет местами `first_name` и `last_name` у всех участников с непустым именем (как одноразовый патч в initDb). */
export async function swapAllMembersFirstLastNames(): Promise<{
  updated: number;
  swapped: number;
  filledFromName: number;
}> {
  // Считаем по RETURNING: rowCount в node-pg иногда null (pooler/драйвер).
  const swapped = await query(
    `UPDATE members m SET
      first_name = m.last_name,
      last_name = m.first_name,
      name = TRIM(
        REGEXP_REPLACE(
          CONCAT_WS(
            ' ',
            NULLIF(TRIM(m.last_name), ''),
            NULLIF(TRIM(m.first_name), '')
          ),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
    WHERE NULLIF(TRIM(COALESCE(m.first_name, '')), '') IS NOT NULL
       OR NULLIF(TRIM(COALESCE(m.last_name, '')), '') IS NOT NULL
    RETURNING m.id`
  );
  const nSwap = swapped.rows.length;

  // Только поле name, ровно 2 слова (как в админке): переносим в колонки без смены порядка слов —
  // иначе массовый UPDATE выше не трогает такие строки.
  const filled = await query(
    `UPDATE members m SET
      first_name = s.parts[1],
      last_name = s.parts[2],
      name = s.n
    FROM (
      SELECT
        id,
        TRIM(REGEXP_REPLACE(COALESCE(name, ''), E'\\\\s+', ' ', 'g')) AS n,
        regexp_split_to_array(
          TRIM(REGEXP_REPLACE(COALESCE(name, ''), E'\\\\s+', ' ', 'g')),
          ' '
        ) AS parts
      FROM members
    ) s
    WHERE m.id = s.id
      AND NULLIF(TRIM(COALESCE(m.first_name, '')), '') IS NULL
      AND NULLIF(TRIM(COALESCE(m.last_name, '')), '') IS NULL
      AND s.n <> ''
      AND CARDINALITY(s.parts) = 2
    RETURNING m.id`
  );

  const filledFromName = filled.rows.length;
  return {
    updated: nSwap + filledFromName,
    swapped: nSwap,
    filledFromName,
  };
}

export async function createUser(input: CreateUserInput): Promise<AppUser> {
  const dupId = await findMemberIdConflictingName(input.first_name, input.last_name);
  if (dupId !== null) {
    if (input.merge_if_duplicate) {
      const existing = await getUserById(dupId);
      if (!existing) {
        throw new Error('User not found');
      }

      const pickNonEmpty = (current: string | null | undefined, incoming: string | undefined): string => {
        const c = (current ?? '').trim();
        if (c) return c;
        return (incoming ?? '').trim();
      };

      const mergedFirstName = pickNonEmpty(existing.first_name, input.first_name);
      const mergedLastName = pickNonEmpty(existing.last_name, input.last_name);
      const mergedPhone = pickNonEmpty(existing.phone_number, input.phone_number);
      const mergedBirthDate = pickNonEmpty(existing.birth_date, input.birth_date);
      const mergedMinistryRole = pickNonEmpty(existing.ministry_role, input.ministry_role);
      const mergedMinistryDirection = pickNonEmpty(existing.ministry_direction, input.ministry_direction);
      const mergedPrayerRequest = pickNonEmpty(existing.prayer_request, input.prayer_request);
      const mergedEmail = pickNonEmpty(existing.email, input.email);
      const mergedAccountProvider = pickNonEmpty(existing.account_provider, input.account_provider);
      const mergedAccountId = pickNonEmpty(existing.account_id, input.account_id);

      const updated = await updateUser(dupId, {
        first_name: mergedFirstName,
        last_name: mergedLastName,
        phone_number: mergedPhone,
        birth_date: mergedBirthDate,
        ...(mergedMinistryRole ? { ministry_role: mergedMinistryRole } : {}),
        ...(mergedMinistryDirection ? { ministry_direction: mergedMinistryDirection } : {}),
        ...(mergedPrayerRequest ? { prayer_request: mergedPrayerRequest } : {}),
        ...(mergedEmail ? { email: mergedEmail } : {}),
        ...(mergedAccountProvider ? { account_provider: mergedAccountProvider } : {}),
        ...(mergedAccountId ? { account_id: mergedAccountId } : {}),
        is_active: existing.is_active || (input.is_active ?? true),
        app_role: mergeAppRoles(existing.app_role, input.app_role ?? 'member'),
        is_collection_coordinator:
          existing.is_collection_coordinator || (input.is_collection_coordinator ?? false),
      });
      if (!updated) {
        throw new Error('User not found');
      }
      return updated;
    }
    throw new MemberNameDuplicateError();
  }

  const result = await query(
    `INSERT INTO members
      (first_name, last_name, name, phone_number, ministry_role, ministry_direction, prayer_request, birth_date, email, account_provider, account_id, is_active, app_role, is_collection_coordinator, in_prayer_cycle, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, TRUE), COALESCE($13, 'member'), COALESCE($14, FALSE), FALSE, NOW())
    RETURNING
      id,
      user_id,
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
      in_prayer_cycle,
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

export interface BulkCreateUsersOutcome {
  users: AppUser[];
  errors: { index: number; message: string }[];
}

/**
 * Создаёт участников по очереди; при ошибке по строке пишет в errors и продолжает.
 */
export async function bulkCreateUsers(items: CreateUserInput[]): Promise<BulkCreateUsersOutcome> {
  const users: AppUser[] = [];
  const errors: { index: number; message: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const input = items[i]!;
    try {
      users.push(await createUser(input));
    } catch (e) {
      if (e instanceof MemberNameDuplicateError) {
        errors.push({ index: i, message: e.message });
      } else if (e instanceof Error && e.message) {
        errors.push({ index: i, message: e.message });
      } else {
        errors.push({ index: i, message: 'Ошибка базы данных' });
      }
    }
  }
  return { users, errors };
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

  if (typeof input.in_prayer_cycle === 'boolean') {
    updates.push(`in_prayer_cycle = $${values.length + 1}`);
    values.push(input.in_prayer_cycle);
  }

  let previousInPrayerCycle: boolean | undefined;
  if (typeof input.in_prayer_cycle === 'boolean') {
    const cur = await getUserById(id);
    if (!cur) {
      return null;
    }
    previousInPrayerCycle = cur.in_prayer_cycle;
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
      user_id,
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
      in_prayer_cycle,
      (password_hash IS NOT NULL) AS has_registered,
      created_at,
      updated_at`,
    values
  );

  const updated = result.rows[0] ? mapUser(result.rows[0] as AppUser) : null;
  if (!updated) {
    return null;
  }

  if (
    typeof input.in_prayer_cycle === 'boolean' &&
    previousInPrayerCycle !== undefined &&
    previousInPrayerCycle !== input.in_prayer_cycle
  ) {
    await resetCycleStartToCurrentDate();
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
      user_id,
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
      in_prayer_cycle,
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

  if (currentUser.app_role === 'admin' && appRole !== 'admin') {
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
      user_id,
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
      in_prayer_cycle,
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

  const created = result.rows[0] as MinistryRoleTemplate;

  // Attach the new role to all existing directions (templates).
  await query(
    `INSERT INTO ministry_direction_role_templates (direction_template_id, role_template_id)
     SELECT d.id, $1
     FROM ministry_direction_templates d
     ON CONFLICT (direction_template_id, role_template_id) DO NOTHING`,
    [created.id]
  );

  return created;
}

export async function deleteMinistryRoleTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM ministry_role_templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listMinistryDirectionTemplates(): Promise<MinistryDirectionTemplateWithRoles[]> {
  const result = await query(
    `SELECT
       d.id,
       d.title,
       d.created_at,
       COALESCE(
         json_agg(
           json_build_object('id', r.id, 'title', r.title, 'created_at', r.created_at)
           ORDER BY r.title ASC
         ) FILTER (WHERE r.id IS NOT NULL),
         '[]'::json
       ) AS roles
     FROM ministry_direction_templates d
     LEFT JOIN ministry_direction_role_templates dr
       ON dr.direction_template_id = d.id
     LEFT JOIN ministry_role_templates r
       ON r.id = dr.role_template_id
     GROUP BY d.id
     ORDER BY d.title ASC`
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    created_at: String(row.created_at),
    roles: Array.isArray((row as { roles?: unknown }).roles)
      ? ((row as { roles: MinistryRoleTemplate[] }).roles as MinistryRoleTemplate[])
      : typeof (row as { roles?: unknown }).roles === 'string'
        ? (JSON.parse((row as { roles: string }).roles) as MinistryRoleTemplate[])
        : ((row as { roles: MinistryRoleTemplate[] }).roles ?? []),
  }));
}

export async function createMinistryDirectionTemplate(
  title: string
): Promise<MinistryDirectionTemplateWithRoles> {
  const result = await query(
    `INSERT INTO ministry_direction_templates (title)
     VALUES ($1)
     RETURNING id, title, created_at`,
    [title.trim()]
  );

  const created = result.rows[0] as MinistryDirectionTemplate;

  // Attach the new direction to all existing roles (templates).
  await query(
    `INSERT INTO ministry_direction_role_templates (direction_template_id, role_template_id)
     SELECT $1, r.id
     FROM ministry_role_templates r
     ON CONFLICT (direction_template_id, role_template_id) DO NOTHING`,
    [created.id]
  );

  const roles = await listMinistryRoleTemplates();
  return { ...created, roles };
}

export async function deleteMinistryDirectionTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM ministry_direction_templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function setMinistryDirectionTemplateRoles(
  directionTemplateId: number,
  roleTemplateIds: number[]
): Promise<MinistryDirectionTemplateWithRoles | null> {
  const dirCheck = await query(
    `SELECT id FROM ministry_direction_templates WHERE id = $1 LIMIT 1`,
    [directionTemplateId]
  );
  if (!dirCheck.rows[0]?.id) {
    return null;
  }

  const uniqRoleIds = Array.from(
    new Set(
      (roleTemplateIds ?? [])
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );

  if (uniqRoleIds.length === 0) {
    await query(
      `DELETE FROM ministry_direction_role_templates
       WHERE direction_template_id = $1`,
      [directionTemplateId]
    );
    const all = await listMinistryDirectionTemplates();
    return all.find((d) => d.id === directionTemplateId) ?? null;
  }

  // Replace mapping (delete missing, insert new). Also ensures role ids exist.
  await query(
    `WITH input_roles AS (
       SELECT UNNEST($2::int[]) AS role_id
     ),
     existing_roles AS (
       SELECT r.id AS role_id
       FROM ministry_role_templates r
       JOIN input_roles i ON i.role_id = r.id
     )
     DELETE FROM ministry_direction_role_templates dr
     WHERE dr.direction_template_id = $1
       AND dr.role_template_id NOT IN (SELECT role_id FROM existing_roles)`,
    [directionTemplateId, uniqRoleIds]
  );

  await query(
    `WITH input_roles AS (
       SELECT UNNEST($2::int[]) AS role_id
     ),
     existing_roles AS (
       SELECT r.id AS role_id
       FROM ministry_role_templates r
       JOIN input_roles i ON i.role_id = r.id
     )
     INSERT INTO ministry_direction_role_templates (direction_template_id, role_template_id)
     SELECT $1, role_id FROM existing_roles
     ON CONFLICT (direction_template_id, role_template_id) DO NOTHING`,
    [directionTemplateId, uniqRoleIds]
  );

  const all = await listMinistryDirectionTemplates();
  return all.find((d) => d.id === directionTemplateId) ?? null;
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

export async function addManualPreviousPrayerNeed(
  memberId: number,
  note: string | null,
  createdByMemberId: number | null
): Promise<void> {
  const normalized = normalizeOptionalString(note);
  if (!normalized) {
    throw new Error('empty_note');
  }
  await query(
    `INSERT INTO member_previous_prayer_needs_manual (member_id, note, created_by_member_id)
     VALUES ($1, $2, $3)`,
    [memberId, normalized, createdByMemberId]
  );
}

export async function updateManualPreviousPrayerNeed(
  id: number,
  note: string | null
): Promise<boolean> {
  const normalized = normalizeOptionalString(note);
  if (!normalized) {
    throw new Error('empty_note');
  }
  const result = await query(
    `UPDATE member_previous_prayer_needs_manual
     SET note = $2
     WHERE id = $1`,
    [id, normalized]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteManualPreviousPrayerNeed(id: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM member_previous_prayer_needs_manual
     WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
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

  const rows = result.rows as PrayerRequestHistoryItem[];

  // prayed_on_date = the date the record was created.
  // This is reliable because the history entry is written on the same day
  // the coordinator/user saves/edits the prayer request — i.e. the prayer day itself.
  // (Using cycle_index * memberCount would be wrong because start_date shifts
  //  via the reset_cycle_on_member_change trigger whenever the member list changes.)
  for (const item of rows) {
    item.prayed_on_date = item.created_at.slice(0, 10);
  }

  return rows;
}
