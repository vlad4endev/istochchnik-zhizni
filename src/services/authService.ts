import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { query } from '../config/db';

const scrypt = promisify(scryptCallback);
const MIN_PASSWORD_LENGTH = 8;
const SESSION_TTL_DAYS = 30;
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 20;

export type AuthRole = 'member' | 'admin';
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AuthUser {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  phone_number: string | null;
  app_role: AuthRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterInput {
  password: string;
  first_name: string;
  last_name: string;
  phone_number: string;
}

export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export type RegisterResult =
  | ({ status: 'approved' } & LoginResult)
  | { status: 'pending'; request_id: number; message: string };

export interface SessionPrincipal {
  userId: number;
  role: AuthRole;
  tokenHash: string;
}

export interface AccessRequestItem {
  id: number;
  first_name: string;
  last_name: string;
  phone_number: string;
  status: AccessRequestStatus;
  member_id: number | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

type MemberRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  phone_number: string | null;
  app_role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  password_hash?: string | null;
};

function normalizeRole(rawRole: unknown): AuthRole {
  if (typeof rawRole !== 'string') {
    return 'member';
  }

  const normalized = rawRole.trim().toLowerCase();
  return normalized === 'admin' ? 'admin' : 'member';
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D+/g, '');
}

function normalizePhoneInput(phone: string): string {
  return phone.trim();
}

function getPhoneDigitsVariants(phoneOrDigits: string): string[] {
  const digits = normalizePhoneDigits(phoneOrDigits);
  if (!digits) {
    return [];
  }

  const variants = new Set<string>([digits]);
  if (digits.length === 11 && digits.startsWith('8')) {
    variants.add(`7${digits.slice(1)}`);
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    variants.add(`8${digits.slice(1)}`);
  }

  return Array.from(variants);
}

function normalizeComparableName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function ensureValidPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Invalid password');
  }
}

function ensureValidPhone(phone: string): void {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) {
    throw new Error('Invalid phone number');
  }
}

function ensureValidName(firstName: string, lastName: string): void {
  if (!firstName || !lastName) {
    throw new Error('Invalid name');
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [salt, keyHex] = passwordHash.split(':');
  if (!salt || !keyHex) {
    return false;
  }

  const actualKey = Buffer.from(keyHex, 'hex');
  const providedKey = (await scrypt(password, salt, actualKey.length)) as Buffer;
  if (providedKey.length !== actualKey.length) {
    return false;
  }

  return timingSafeEqual(providedKey, actualKey);
}

function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function mapAuthUser(row: MemberRow): AuthUser {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    name: row.name,
    phone_number: row.phone_number,
    app_role: normalizeRole(row.app_role),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createSessionForUser(userId: number): Promise<{ token: string; expiresAt: string }> {
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO auth_sessions (token_hash, member_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt.toISOString()]
  );

  return { token, expiresAt: expiresAt.toISOString() };
}

async function findMemberByIdentity(
  firstName: string,
  lastName: string,
  fullName: string,
  phoneDigits: string
): Promise<MemberRow | null> {
  const reverseFullName = `${lastName} ${firstName}`.trim();
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      created_at,
      updated_at,
      password_hash
    FROM members
    WHERE (
      (
        LOWER(COALESCE(first_name, '')) = LOWER($1)
        AND LOWER(COALESCE(last_name, '')) = LOWER($2)
      )
      OR LOWER(TRIM(name)) = LOWER($3)
      OR LOWER(TRIM(name)) = LOWER($5)
    )
      AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($4::text[])
    ORDER BY id ASC
    LIMIT 1`,
    [firstName, lastName, fullName, phoneVariants, reverseFullName]
  );

  return (result.rows[0] as MemberRow | undefined) ?? null;
}

async function findMemberByNameWithoutPhone(
  firstName: string,
  lastName: string,
  fullName: string
): Promise<MemberRow | null> {
  const reverseFullName = `${lastName} ${firstName}`.trim();
  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      created_at,
      updated_at,
      password_hash
    FROM members
    WHERE (
      (
        LOWER(COALESCE(first_name, '')) = LOWER($1)
        AND LOWER(COALESCE(last_name, '')) = LOWER($2)
      )
      OR LOWER(TRIM(name)) = LOWER($3)
      OR LOWER(TRIM(name)) = LOWER($4)
    )
      AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ''
    ORDER BY id ASC
    LIMIT 1`,
    [firstName, lastName, fullName, reverseFullName]
  );

  return (result.rows[0] as MemberRow | undefined) ?? null;
}

async function findAlreadyRegisteredMemberByName(
  firstName: string,
  lastName: string,
  fullName: string
): Promise<MemberRow | null> {
  const reverseFullName = `${lastName} ${firstName}`.trim();
  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      created_at,
      updated_at,
      password_hash
    FROM members
    WHERE (
      (
        LOWER(COALESCE(first_name, '')) = LOWER($1)
        AND LOWER(COALESCE(last_name, '')) = LOWER($2)
      )
      OR LOWER(TRIM(name)) = LOWER($3)
      OR LOWER(TRIM(name)) = LOWER($4)
    )
      AND password_hash IS NOT NULL
    ORDER BY id ASC
    LIMIT 1`,
    [firstName, lastName, fullName, reverseFullName]
  );

  return (result.rows[0] as MemberRow | undefined) ?? null;
}

async function findMemberByPhoneDigits(phoneDigits: string): Promise<MemberRow | null> {
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      created_at,
      updated_at,
      password_hash
    FROM members
    WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
    ORDER BY id ASC
    LIMIT 2`,
    [phoneVariants]
  );

  if (result.rows.length > 1) {
    throw new Error('Ambiguous phone number');
  }

  return (result.rows[0] as MemberRow | undefined) ?? null;
}

function isInputNameMatchingMember(member: MemberRow, firstName: string, lastName: string): boolean {
  const inputDirect = normalizeComparableName(`${firstName} ${lastName}`);
  const inputReverse = normalizeComparableName(`${lastName} ${firstName}`);
  const memberFull = normalizeComparableName(member.name);
  const memberSplit =
    member.first_name && member.last_name
      ? normalizeComparableName(`${member.first_name} ${member.last_name}`)
      : '';
  const memberSplitReverse =
    member.first_name && member.last_name
      ? normalizeComparableName(`${member.last_name} ${member.first_name}`)
      : '';

  return (
    inputDirect === memberFull ||
    inputReverse === memberFull ||
    (memberSplit.length > 0 && (inputDirect === memberSplit || inputDirect === memberSplitReverse))
  );
}

async function createPendingAccessRequest(
  firstName: string,
  lastName: string,
  phoneNumber: string,
  phoneDigits: string,
  passwordHash: string
): Promise<number> {
  const duplicatePending = await query(
    `SELECT id
     FROM access_requests
     WHERE first_name = $1
       AND last_name = $2
       AND phone_digits = $3
       AND status = 'pending'
     LIMIT 1`,
    [firstName, lastName, phoneDigits]
  );

  if (duplicatePending.rows[0]?.id) {
    return Number(duplicatePending.rows[0].id);
  }

  const inserted = await query(
    `INSERT INTO access_requests
      (first_name, last_name, full_name, phone_number, phone_digits, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [firstName, lastName, `${firstName} ${lastName}`.trim(), phoneNumber, phoneDigits, passwordHash]
  );

  return Number(inserted.rows[0].id);
}

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const firstName = input.first_name.trim();
  const lastName = input.last_name.trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const phoneNumber = normalizePhoneInput(input.phone_number);
  const phoneDigits = normalizePhoneDigits(phoneNumber);

  ensureValidName(firstName, lastName);
  ensureValidPhone(phoneNumber);
  ensureValidPassword(input.password);

  const matchedByPhone = await findMemberByPhoneDigits(phoneDigits);
  if (matchedByPhone?.password_hash) {
    throw new Error('Account already exists');
  }
  if (matchedByPhone && !isInputNameMatchingMember(matchedByPhone, firstName, lastName)) {
    throw new Error('Member identity mismatch');
  }

  const alreadyRegisteredMember = await findAlreadyRegisteredMemberByName(
    firstName,
    lastName,
    fullName
  );
  if (alreadyRegisteredMember) {
    throw new Error('Account already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const matchedMember =
    (await findMemberByIdentity(firstName, lastName, fullName, phoneDigits)) ??
    (await findMemberByNameWithoutPhone(firstName, lastName, fullName));

  if (matchedMember) {
    if (matchedMember.password_hash) {
      throw new Error('Account already exists');
    }

    const updatedResult = await query(
      `UPDATE members
       SET
        first_name = $1,
        last_name = $2,
        name = $3,
        phone_number = $4,
        password_hash = $5,
        app_role = COALESCE(NULLIF(app_role, ''), 'member'),
        is_active = TRUE,
        updated_at = NOW()
       WHERE id = $6
       RETURNING
        id,
        first_name,
        last_name,
        name,
        phone_number,
        app_role,
        is_active,
        created_at,
        updated_at`,
      [firstName, lastName, fullName, phoneNumber, passwordHash, matchedMember.id]
    );

    const member = updatedResult.rows[0] as MemberRow;
    const { token, expiresAt } = await createSessionForUser(member.id);
    return {
      status: 'approved',
      token,
      expires_at: expiresAt,
      user: mapAuthUser(member),
    };
  }

  const requestId = await createPendingAccessRequest(
    firstName,
    lastName,
    phoneNumber,
    phoneDigits,
    passwordHash
  );

  return {
    status: 'pending',
    request_id: requestId,
    message: 'Заявка отправлена администратору. Доступ будет открыт после подтверждения.',
  };
}

export async function loginUser(phoneInput: string, password: string): Promise<LoginResult | null> {
  const phoneDigits = normalizePhoneDigits(phoneInput.trim());
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  ensureValidPhone(phoneInput);
  ensureValidPassword(password);

  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      created_at,
      updated_at,
      password_hash
    FROM members
    WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
      AND password_hash IS NOT NULL
    ORDER BY id ASC
    LIMIT 2`,
    [phoneVariants]
  );

  if (result.rows.length > 1) {
    throw new Error('Ambiguous phone number');
  }

  const row = result.rows[0] as (MemberRow & { password_hash: string | null }) | undefined;
  if (!row || !row.password_hash || !row.is_active) {
    return null;
  }

  const isPasswordValid = await verifyPassword(password, row.password_hash);
  if (!isPasswordValid) {
    return null;
  }

  const { token, expiresAt } = await createSessionForUser(row.id);
  const user = mapAuthUser(row);
  return {
    token,
    expires_at: expiresAt,
    user,
  };
}

export async function resolveSessionByToken(token: string): Promise<SessionPrincipal | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  const result = await query(
    `SELECT m.id AS user_id, m.app_role
     FROM auth_sessions s
     JOIN members m ON m.id = s.member_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND m.is_active = TRUE
     LIMIT 1`,
    [tokenHash]
  );

  const row = result.rows[0] as { user_id: number; app_role: string } | undefined;
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    role: normalizeRole(row.app_role),
    tokenHash,
  };
}

export async function logoutByToken(token: string): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return;
  }

  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  await query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
}

export async function getAuthUserById(userId: number): Promise<AuthUser | null> {
  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      created_at,
      updated_at
    FROM members
    WHERE id = $1
      AND is_active = TRUE
    LIMIT 1`,
    [userId]
  );

  const row = result.rows[0] as MemberRow | undefined;
  return row ? mapAuthUser(row) : null;
}

export async function listAccessRequests(status?: AccessRequestStatus): Promise<AccessRequestItem[]> {
  const params: unknown[] = [];
  let whereSql = '';
  if (status) {
    params.push(status);
    whereSql = `WHERE status = $${params.length}`;
  }

  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      phone_number,
      status,
      member_id,
      review_note,
      created_at,
      reviewed_at
    FROM access_requests
    ${whereSql}
    ORDER BY created_at DESC`,
    params
  );

  return result.rows as AccessRequestItem[];
}

export async function approveAccessRequest(
  requestId: number,
  reviewerId: number,
  reviewNote?: string
): Promise<AuthUser | null> {
  const requestResult = await query(
    `SELECT
      id,
      first_name,
      last_name,
      full_name,
      phone_number,
      phone_digits,
      password_hash,
      status,
      member_id
    FROM access_requests
    WHERE id = $1
    LIMIT 1`,
    [requestId]
  );

  const requestRow = requestResult.rows[0] as
    | {
        id: number;
        first_name: string;
        last_name: string;
        full_name: string;
        phone_number: string;
        phone_digits: string;
        password_hash: string;
        status: AccessRequestStatus;
        member_id: number | null;
      }
    | undefined;

  if (!requestRow || requestRow.status !== 'pending') {
    return null;
  }

  const existingMember = await findMemberByIdentity(
    requestRow.first_name,
    requestRow.last_name,
    requestRow.full_name,
    requestRow.phone_digits
  );

  let member: MemberRow;
  if (existingMember) {
    const updated = await query(
      `UPDATE members
       SET
        first_name = $1,
        last_name = $2,
        name = $3,
        phone_number = $4,
        password_hash = $5,
        app_role = COALESCE(NULLIF(app_role, ''), 'member'),
        is_active = TRUE,
        updated_at = NOW()
       WHERE id = $6
       RETURNING
        id,
        first_name,
        last_name,
        name,
        phone_number,
        app_role,
        is_active,
        created_at,
        updated_at`,
      [
        requestRow.first_name,
        requestRow.last_name,
        requestRow.full_name,
        requestRow.phone_number,
        requestRow.password_hash,
        existingMember.id,
      ]
    );
    member = updated.rows[0] as MemberRow;
  } else {
    const inserted = await query(
      `INSERT INTO members
        (first_name, last_name, name, phone_number, password_hash, app_role, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'member', TRUE, NOW())
       RETURNING
        id,
        first_name,
        last_name,
        name,
        phone_number,
        app_role,
        is_active,
        created_at,
        updated_at`,
      [
        requestRow.first_name,
        requestRow.last_name,
        requestRow.full_name,
        requestRow.phone_number,
        requestRow.password_hash,
      ]
    );
    member = inserted.rows[0] as MemberRow;
  }

  await query(
    `UPDATE access_requests
     SET
      status = 'approved',
      member_id = $1,
      reviewed_by_member_id = $2,
      review_note = $3,
      reviewed_at = NOW(),
      updated_at = NOW()
     WHERE id = $4`,
    [member.id, reviewerId, reviewNote?.trim() || null, requestId]
  );

  return mapAuthUser(member);
}

export async function rejectAccessRequest(
  requestId: number,
  reviewerId: number,
  reviewNote?: string
): Promise<boolean> {
  const result = await query(
    `UPDATE access_requests
     SET
      status = 'rejected',
      reviewed_by_member_id = $1,
      review_note = $2,
      reviewed_at = NOW(),
      updated_at = NOW()
     WHERE id = $3
       AND status = 'pending'`,
    [reviewerId, reviewNote?.trim() || null, requestId]
  );

  return (result.rowCount ?? 0) > 0;
}
