import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { query } from '../config/db';
import type { PrayerCyclePublic } from './prayerCycleService';
import { getPrayerCycleSnapshotForDate, toPublicCycleInfo } from './prayerCycleService';
import type { AppRole } from '../types/appRole';
import { normalizeAppRole, normalizeAppRoles } from '../types/appRole';
import { findMemberIdConflictingName, updateUser } from './userService';
import { postRegistrationAccessRequestMessengerNotification } from './messengerService';
import { resolveSmsRuntimeConfig } from './smsSettingsService';
import { sendPasswordResetTelegramMessage } from './telegramService';

const scrypt = promisify(scryptCallback);
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_ACCESS_TTL_MINUTES = 15;
const MIN_ACCESS_TTL_MINUTES = 1;
const MAX_ACCESS_TTL_MINUTES = 24 * 60;
const DEFAULT_REFRESH_TTL_DAYS = 7;
const MIN_REFRESH_TTL_DAYS = 1;
const MAX_REFRESH_TTL_DAYS = 365;
const DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER = 3;
const MIN_ACTIVE_SESSIONS_PER_USER = 1;
const MAX_ACTIVE_SESSIONS_PER_USER = 20;
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 20;
const PASSWORD_RESET_CODE_TTL_SEC = 5 * 60;
const PASSWORD_RESET_VERIFY_TTL_SEC = 15 * 60;
const PASSWORD_RESET_RESEND_INTERVAL_SEC = 60;
const PASSWORD_RESET_MAX_ATTEMPTS = 3;
const PASSWORD_RESET_LOCKOUT_SEC = 2 * 60;

/** Исчерпаны попытки ввода кода или активна блокировка после них. */
export class PasswordResetLockedError extends Error {
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super('password_reset_locked');
    this.name = 'PasswordResetLockedError';
    this.retryAfterSec = retryAfterSec;
  }
}

export type AuthRole = AppRole;
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type AccessRequestType = 'registration' | 'password_reset';

export type RegistrationStatus = 'active' | 'pending_review' | 'rejected';

export interface AuthUser {
  id: number;
  /** Слаг публичной страницы (`/profile/:username`), совпадает с `user_profiles.username` или `member-{id}`. */
  username: string;
  /** Публичный UUID (не числовой id). */
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  avatar_url: string | null;
  public_key?: string | null;
  phone_number: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  birth_date: string | null;
  email: string | null;
  prayer_request: string | null;
  app_role: AuthRole;
  app_roles: AuthRole[];
  is_active: boolean;
  /** Ожидание подтверждения регистрации или отказ; для обычных участников — active. */
  registration_status: RegistrationStatus;
  is_collection_coordinator: boolean;
  /** Участвует в общем молитвенном цикле (назначение дней молитвы). */
  in_prayer_cycle: boolean;
  created_at: string;
  updated_at: string;
  /** Текущий молитвенный цикл (на «сегодня» по UTC); нужда в профиле относится к этому циклу. */
  prayer_cycle?: PrayerCyclePublic | null;
}

export interface RegisterInput {
  password: string;
  first_name: string;
  last_name: string;
  phone_number: string;
}

export interface PasswordResetRequestInput {
  password: string;
  first_name: string;
  last_name: string;
  phone_number: string;
}

export interface PasswordResetSmsRequestResult {
  status: 'code_sent';
  expires_in_sec: number;
  retry_after_sec: number;
}

export interface PasswordResetSmsVerifyResult {
  status: 'verified';
  reset_token: string;
  expires_in_sec: number;
}

export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export interface LoginPasswordResetRequiredResult {
  status: 'password_reset_required';
  phone_number: string;
}

export type LoginAttemptResult = LoginResult | LoginPasswordResetRequiredResult;

export type RegisterResult =
  | ({ status: 'approved' } & LoginResult)
  | {
      status: 'pending';
      request_id: number;
      message: string;
      /** Есть после создания заявки с предварительной записью участника (новый поток). */
      token?: string;
      expires_at?: string;
      user?: AuthUser;
    };

export interface SessionPrincipal {
  userId: number;
  role: AuthRole;
  roles: AuthRole[];
  tokenHash: string;
}

export interface AccessRequestItem {
  id: number;
  first_name: string;
  last_name: string;
  phone_number: string;
  request_type: AccessRequestType;
  status: AccessRequestStatus;
  member_id: number | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

type MemberRow = {
  id: number;
  user_id?: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string;
  avatar_url?: string | null;
  public_key?: string | null;
  phone_number: string | null;
  ministry_role?: string | null;
  ministry_direction?: string | null;
  birth_date: string | null;
  email: string | null;
  prayer_request: string | null;
  app_role: string;
  app_roles?: unknown;
  is_active: boolean;
  registration_status?: string | null;
  is_collection_coordinator?: boolean;
  in_prayer_cycle?: boolean;
  created_at: string;
  updated_at: string;
  password_hash?: string | null;
  password_reset_required?: boolean;
  password_reset_locked_until?: string | null;
  telegram_chat_id?: string | null;
  telegram_delivery_blocked?: boolean;
  profile_username?: string | null;
};

function normalizeRegistrationStatus(raw: unknown): RegistrationStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'pending_review' || s === 'rejected' || s === 'active') {
    return s;
  }
  return 'active';
}

function normalizeRole(rawRole: unknown): AuthRole {
  return normalizeAppRole(rawRole);
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

function createPasswordResetCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashResetValue(value: string): Promise<string> {
  const cfg = await resolveSmsRuntimeConfig();
  const secret = String(cfg.resetSecret || '').trim();
  return createHash('sha256').update(`${secret}:${value}`).digest('hex');
}

function getAccessTtlMinutes(): number {
  const rawValue = process.env.AUTH_ACCESS_TOKEN_TTL_MINUTES;
  if (!rawValue) {
    return DEFAULT_ACCESS_TTL_MINUTES;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ACCESS_TTL_MINUTES;
  }

  const integerValue = Math.floor(parsed);
  return Math.min(MAX_ACCESS_TTL_MINUTES, Math.max(MIN_ACCESS_TTL_MINUTES, integerValue));
}

function getRefreshTtlDays(): number {
  const rawValue = process.env.AUTH_REFRESH_TOKEN_TTL_DAYS;
  if (!rawValue) {
    return DEFAULT_REFRESH_TTL_DAYS;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REFRESH_TTL_DAYS;
  }

  const integerValue = Math.floor(parsed);
  return Math.min(MAX_REFRESH_TTL_DAYS, Math.max(MIN_REFRESH_TTL_DAYS, integerValue));
}

function getMaxActiveSessionsPerUser(): number {
  const rawValue = process.env.AUTH_MAX_ACTIVE_SESSIONS_PER_USER;
  if (!rawValue) {
    return DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER;
  }

  const integerValue = Math.floor(parsed);
  return Math.min(
    MAX_ACTIVE_SESSIONS_PER_USER,
    Math.max(MIN_ACTIVE_SESSIONS_PER_USER, integerValue)
  );
}

function mapAuthUser(row: MemberRow): AuthUser {
  const slug =
    typeof row.profile_username === 'string' && row.profile_username.trim() !== ''
      ? row.profile_username.trim()
      : `member-${row.id}`;
  return {
    id: row.id,
    username: slug,
    user_id: row.user_id != null && String(row.user_id).trim() !== '' ? String(row.user_id) : '',
    first_name: row.first_name,
    last_name: row.last_name,
    name: row.name,
    avatar_url: (row.avatar_url ?? null) as string | null,
    public_key: (row.public_key ?? null) as string | null,
    phone_number: row.phone_number,
    ministry_role: (row.ministry_role ?? null) as string | null,
    ministry_direction: (row.ministry_direction ?? null) as string | null,
    birth_date: row.birth_date ?? null,
    email: row.email ?? null,
    prayer_request: row.prayer_request ?? null,
    app_role: normalizeRole(row.app_role),
    app_roles: normalizeAppRoles(row.app_roles, row.app_role),
    is_active: row.is_active,
    registration_status: normalizeRegistrationStatus(row.registration_status),
    is_collection_coordinator: Boolean(row.is_collection_coordinator),
    in_prayer_cycle: Boolean(row.in_prayer_cycle),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createSessionForUser(userId: number): Promise<{ token: string; expiresAt: string }> {
  const { token, tokenHash } = createSessionToken();
  const accessTtlMinutes = getAccessTtlMinutes();
  const maxActiveSessions = getMaxActiveSessionsPerUser();
  const expiresAt = new Date(Date.now() + accessTtlMinutes * 60 * 1000);

  // Remove stale sessions first to keep per-user session limits accurate.
  await query(
    `DELETE FROM auth_sessions
     WHERE member_id = $1
       AND expires_at <= NOW()`,
    [userId]
  );

  await query(
    `INSERT INTO auth_sessions (token_hash, member_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt.toISOString()]
  );

  // Keep recent sessions only (for multi-device sign-in).
  await query(
    `DELETE FROM auth_sessions
     WHERE member_id = $1
       AND token_hash IN (
         SELECT token_hash
         FROM auth_sessions
         WHERE member_id = $1
         ORDER BY created_at DESC, token_hash DESC
         OFFSET $2
       )`,
    [userId, maxActiveSessions]
  );

  return { token, expiresAt: expiresAt.toISOString() };
}

function createRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(64).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export async function issueRefreshSessionForUser(
  userId: number
): Promise<{ refreshToken: string; expiresAt: string }> {
  const { token, tokenHash } = createRefreshToken();
  const refreshTtlDays = getRefreshTtlDays();
  const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
  const maxActiveSessions = getMaxActiveSessionsPerUser();

  await query(
    `DELETE FROM auth_refresh_sessions
     WHERE member_id = $1
       AND (expires_at <= NOW() OR revoked_at IS NOT NULL)`,
    [userId]
  );

  await query(
    `INSERT INTO auth_refresh_sessions (token_hash, member_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt.toISOString()]
  );

  await query(
    `DELETE FROM auth_refresh_sessions
     WHERE member_id = $1
       AND token_hash IN (
         SELECT token_hash
         FROM auth_refresh_sessions
         WHERE member_id = $1
           AND revoked_at IS NULL
         ORDER BY created_at DESC, token_hash DESC
         OFFSET $2
       )`,
    [userId, maxActiveSessions]
  );

  return { refreshToken: token, expiresAt: expiresAt.toISOString() };
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
      user_id,
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
      user_id,
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
      user_id,
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
      AND COALESCE(registration_status, 'active') IS DISTINCT FROM 'pending_review'
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
      user_id,
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

async function findMemberWithPasswordByPhone(phoneInput: string): Promise<MemberRow | null> {
  const phoneDigits = normalizePhoneDigits(phoneInput);
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  if (!phoneVariants.length) return null;

  const result = await query(
    `SELECT
      id,
      user_id,
      first_name,
      last_name,
      name,
      phone_number,
      app_role,
      is_active,
      registration_status,
      created_at,
      updated_at,
      password_hash,
      password_reset_locked_until,
      telegram_chat_id,
      telegram_delivery_blocked
    FROM members
    WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
      AND password_hash IS NOT NULL
      AND is_active = TRUE
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
  passwordHash: string,
  requestType: AccessRequestType,
  linkedMemberId: number | null = null
): Promise<{ id: number; created: boolean }> {
  const duplicatePending = await query(
    `SELECT id, member_id
     FROM access_requests
     WHERE first_name = $1
       AND last_name = $2
       AND phone_digits = $3
       AND request_type = $4
       AND status = 'pending'
     LIMIT 1`,
    [firstName, lastName, phoneDigits, requestType]
  );

  if (duplicatePending.rows[0]?.id) {
    return { id: Number(duplicatePending.rows[0].id), created: false };
  }

  const inserted = await query(
    `INSERT INTO access_requests
      (first_name, last_name, full_name, phone_number, phone_digits, password_hash, request_type, status, member_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING id`,
    [
      firstName,
      lastName,
      `${firstName} ${lastName}`.trim(),
      phoneNumber,
      phoneDigits,
      passwordHash,
      requestType,
      linkedMemberId,
    ]
  );

  return { id: Number(inserted.rows[0].id), created: true };
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
        user_id,
        first_name,
        last_name,
        name,
        phone_number,
        birth_date,
        email,
        prayer_request,
        app_role,
        is_active,
        is_collection_coordinator,
        in_prayer_cycle,
        created_at,
        updated_at`,
      [firstName, lastName, fullName, phoneNumber, passwordHash, matchedMember.id]
    );

    const member = updatedResult.rows[0] as MemberRow;
    const { token, expiresAt } = await createSessionForUser(member.id);
    const user = await getAuthUserById(member.id);
    if (!user) {
      throw new Error('Member not found after approval');
    }
    return {
      status: 'approved',
      token,
      expires_at: expiresAt,
      user,
    };
  }

  const sameNameMemberId = await findMemberIdConflictingName(firstName, lastName);
  if (sameNameMemberId != null) {
    const dupCheck = await query(
      `SELECT id, password_hash FROM members WHERE id = $1 LIMIT 1`,
      [sameNameMemberId]
    );
    const dupRow = dupCheck.rows[0] as { id: number; password_hash: string | null } | undefined;
    if (dupRow?.password_hash) {
      throw new Error('Account already exists');
    }
    if (dupRow) {
      const mergedResult = await query(
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
          user_id,
          first_name,
          last_name,
          name,
          phone_number,
          birth_date,
          email,
          prayer_request,
        app_role,
        is_active,
        is_collection_coordinator,
        in_prayer_cycle,
        created_at,
        updated_at`,
        [firstName, lastName, fullName, phoneNumber, passwordHash, dupRow.id]
      );
      const member = mergedResult.rows[0] as MemberRow;
      const { token, expiresAt } = await createSessionForUser(member.id);
      const user = await getAuthUserById(member.id);
      if (!user) {
        throw new Error('Member not found after approval');
      }
      return {
        status: 'approved',
        token,
        expires_at: expiresAt,
        user,
      };
    }
  }

  const duplicatePending = await query(
    `SELECT ar.id, ar.member_id
     FROM access_requests ar
     WHERE ar.first_name = $1
       AND ar.last_name = $2
       AND ar.phone_digits = $3
       AND ar.request_type = 'registration'
       AND ar.status = 'pending'
     LIMIT 1`,
    [firstName, lastName, phoneDigits]
  );

  const dupPending = duplicatePending.rows[0] as { id: unknown; member_id: unknown } | undefined;
  if (dupPending?.id != null) {
    const rid = Number(dupPending.id);
    const mid =
      dupPending.member_id != null && dupPending.member_id !== ''
        ? Number(dupPending.member_id)
        : NaN;
    const dupMsg =
      'Заявка уже отправлена. Ожидайте подтверждения администратора. Доступны главная страница и чаты.';
    if (Number.isFinite(mid)) {
      const mPw = await query(
        `SELECT password_hash FROM members WHERE id = $1 AND registration_status = 'pending_review' LIMIT 1`,
        [mid]
      );
      const storedHash = mPw.rows[0]?.password_hash as string | undefined;
      if (storedHash && (await verifyPassword(input.password, storedHash))) {
        const { token, expiresAt } = await createSessionForUser(mid);
        const user = await getAuthUserById(mid);
        if (user) {
          return {
            status: 'pending',
            request_id: rid,
            message: dupMsg,
            token,
            expires_at: expiresAt,
            user,
          };
        }
      }
    }
    return {
      status: 'pending',
      request_id: rid,
      message:
        'Заявка уже была отправлена ранее. Дождитесь ответа администратора или войдите с тем же телефоном и паролем.',
    };
  }

  const provisional = await query(
    `INSERT INTO members (
       first_name, last_name, name, phone_number, password_hash, app_role,
       is_active, registration_status, in_prayer_cycle, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'member', TRUE, 'pending_review', FALSE, NOW())
     RETURNING id`,
    [firstName, lastName, fullName, phoneNumber, passwordHash]
  );
  const provisionalId = Number((provisional.rows[0] as { id?: unknown } | undefined)?.id);
  if (!Number.isFinite(provisionalId)) {
    throw new Error('Database error');
  }

  const { id: requestId, created } = await createPendingAccessRequest(
    firstName,
    lastName,
    phoneNumber,
    phoneDigits,
    passwordHash,
    'registration',
    provisionalId
  );

  if (created) {
    void postRegistrationAccessRequestMessengerNotification({
      accessRequestId: requestId,
      firstName,
      lastName,
      fullName,
      phoneNumber,
    }).catch((e) => console.error('[auth] messenger registration notify:', e));
  }

  const { token, expiresAt } = await createSessionForUser(provisionalId);
  const user = await getAuthUserById(provisionalId);
  if (!user) {
    throw new Error('Member not found after provisional registration');
  }

  return {
    status: 'pending',
    request_id: requestId,
    message:
      'Заявка отправлена администратору. Пока её рассматривают, доступны главная страница (события церкви) и чаты — там можно написать в поддержку.',
    token,
    expires_at: expiresAt,
    user,
  };
}

export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<{
  status: 'pending';
  request_id: number;
  message: string;
}> {
  const firstName = input.first_name.trim();
  const lastName = input.last_name.trim();
  const phoneNumber = normalizePhoneInput(input.phone_number);
  const phoneDigits = normalizePhoneDigits(phoneNumber);
  ensureValidName(firstName, lastName);
  ensureValidPhone(phoneNumber);
  ensureValidPassword(input.password);

  const passwordHash = await hashPassword(input.password);
  const { id: requestId } = await createPendingAccessRequest(
    firstName,
    lastName,
    phoneNumber,
    phoneDigits,
    passwordHash,
    'password_reset'
  );

  return {
    status: 'pending',
    request_id: requestId,
    message:
      'Заявка на сброс пароля отправлена администратору. Новый пароль начнёт работать после подтверждения.',
  };
}

export async function startPasswordResetViaTelegram(
  phoneInput: string,
): Promise<PasswordResetSmsRequestResult> {
  ensureValidPhone(phoneInput);
  const member = await findMemberWithPasswordByPhone(phoneInput);
  if (!member?.phone_number) {
    throw new Error('Account not found');
  }

  const lockRaw = member.password_reset_locked_until;
  const lockUntilMs = lockRaw ? new Date(lockRaw).getTime() : NaN;
  const now = Date.now();
  if (!Number.isNaN(lockUntilMs) && lockUntilMs > now) {
    return {
      status: 'code_sent',
      expires_in_sec: PASSWORD_RESET_CODE_TTL_SEC,
      retry_after_sec: Math.max(1, Math.ceil((lockUntilMs - now) / 1000)),
    };
  }

  const chatId = typeof member.telegram_chat_id === 'string' ? member.telegram_chat_id.trim() : '';
  if (!chatId) {
    throw new Error('Telegram not linked');
  }
  if (member.telegram_delivery_blocked) {
    throw new Error('Telegram delivery blocked');
  }

  const memberPhoneDigits = normalizePhoneDigits(member.phone_number);
  const pending = await query(
    `SELECT send_not_before
     FROM password_reset_sms_codes
     WHERE member_id = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [member.id]
  );
  const pendingRow = pending.rows[0] as { send_not_before: string | null } | undefined;
  if (pendingRow?.send_not_before) {
    const retryAt = new Date(pendingRow.send_not_before).getTime();
    if (!Number.isNaN(retryAt) && retryAt > now) {
      return {
        status: 'code_sent',
        expires_in_sec: PASSWORD_RESET_CODE_TTL_SEC,
        retry_after_sec: Math.max(1, Math.ceil((retryAt - now) / 1000)),
      };
    }
  }

  const code = createPasswordResetCode();
  const codeHash = await hashResetValue(`${member.id}:${memberPhoneDigits}:${code}`);
  const expiresAt = new Date(now + PASSWORD_RESET_CODE_TTL_SEC * 1000).toISOString();
  const sendNotBefore = new Date(now + PASSWORD_RESET_RESEND_INTERVAL_SEC * 1000).toISOString();

  const inserted = await query(
    `INSERT INTO password_reset_sms_codes (
      member_id,
      phone_digits,
      code_hash,
      expires_at,
      send_not_before
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [member.id, memberPhoneDigits, codeHash, expiresAt, sendNotBefore]
  );

  const message = `Код восстановления пароля: ${code}. Действует ${Math.floor(PASSWORD_RESET_CODE_TTL_SEC / 60)} мин. Никому его не сообщайте.`;
  try {
    await sendPasswordResetTelegramMessage(chatId, message);
  } catch (e) {
    await query(`DELETE FROM password_reset_sms_codes WHERE id = $1`, [
      (inserted.rows[0] as { id: number }).id,
    ]);
    throw e;
  }

  return {
    status: 'code_sent',
    expires_in_sec: PASSWORD_RESET_CODE_TTL_SEC,
    retry_after_sec: PASSWORD_RESET_RESEND_INTERVAL_SEC,
  };
}

export async function verifyPasswordResetSmsCode(
  phoneInput: string,
  codeInput: string
): Promise<PasswordResetSmsVerifyResult> {
  ensureValidPhone(phoneInput);
  const code = String(codeInput || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Invalid code');
  }

  const member = await findMemberWithPasswordByPhone(phoneInput);
  if (!member?.phone_number) {
    throw new Error('Account not found');
  }

  const lockRaw = member.password_reset_locked_until;
  const lockUntilMs = lockRaw ? new Date(lockRaw).getTime() : NaN;
  if (!Number.isNaN(lockUntilMs) && lockUntilMs > Date.now()) {
    throw new PasswordResetLockedError(Math.max(1, Math.ceil((lockUntilMs - Date.now()) / 1000)));
  }

  const memberPhoneDigits = normalizePhoneDigits(member.phone_number);

  const rowResult = await query(
    `SELECT id, code_hash, attempts_count
     FROM password_reset_sms_codes
     WHERE member_id = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [member.id]
  );
  const row = rowResult.rows[0] as
    | {
        id: number;
        code_hash: string;
        attempts_count: number;
      }
    | undefined;
  if (!row) {
    throw new Error('Code expired');
  }

  const expectedHash = await hashResetValue(`${member.id}:${memberPhoneDigits}:${code}`);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(String(row.code_hash), 'hex');
  const codeOk =
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);

  if (!codeOk) {
    const prevAttempts = row.attempts_count ?? 0;
    const nextAttempts = prevAttempts + 1;
    if (nextAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      await query(
        `UPDATE password_reset_sms_codes
         SET attempts_count = $1,
             consumed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [nextAttempts, row.id]
      );
      await query(
        `UPDATE members
         SET password_reset_locked_until = NOW() + ($2::double precision * INTERVAL '1 second'),
             updated_at = NOW()
         WHERE id = $1`,
        [member.id, PASSWORD_RESET_LOCKOUT_SEC]
      );
      throw new PasswordResetLockedError(PASSWORD_RESET_LOCKOUT_SEC);
    }
    await query(
      `UPDATE password_reset_sms_codes
       SET attempts_count = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [nextAttempts, row.id]
    );
    throw new Error('Invalid code');
  }

  const resetToken = randomBytes(32).toString('hex');
  const resetTokenHash = await hashResetValue(`token:${resetToken}`);
  const verifyExpiresAt = new Date(Date.now() + PASSWORD_RESET_VERIFY_TTL_SEC * 1000).toISOString();
  await query(
    `UPDATE password_reset_sms_codes
     SET verified_at = NOW(),
         verified_token_hash = $2,
         verified_expires_at = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [row.id, resetTokenHash, verifyExpiresAt]
  );

  return {
    status: 'verified',
    reset_token: resetToken,
    expires_in_sec: PASSWORD_RESET_VERIFY_TTL_SEC,
  };
}

export async function confirmPasswordResetViaSms(
  phoneInput: string,
  resetToken: string,
  newPassword: string
): Promise<void> {
  ensureValidPhone(phoneInput);
  ensureValidPassword(newPassword);
  const token = String(resetToken || '').trim();
  if (token.length < 32) {
    throw new Error('Invalid reset token');
  }

  const member = await findMemberWithPasswordByPhone(phoneInput);
  if (!member) {
    throw new Error('Account not found');
  }

  const tokenHash = await hashResetValue(`token:${token}`);
  const rowResult = await query(
    `SELECT id
     FROM password_reset_sms_codes
     WHERE member_id = $1
       AND verified_token_hash = $2
       AND verified_expires_at > NOW()
       AND consumed_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [member.id, tokenHash]
  );
  const row = rowResult.rows[0] as { id: number } | undefined;
  if (!row) {
    throw new Error('Reset session expired');
  }

  const newHash = await hashPassword(newPassword);
  await query(
    `UPDATE members
     SET password_hash = $1,
         password_reset_locked_until = NULL,
         updated_at = NOW()
     WHERE id = $2`,
    [newHash, member.id]
  );
  await query(`DELETE FROM auth_sessions WHERE member_id = $1`, [member.id]);
  await query(
    `UPDATE password_reset_sms_codes
     SET consumed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [row.id]
  );
}

export async function loginUser(phoneInput: string, password: string): Promise<LoginAttemptResult | null> {
  const phoneDigits = normalizePhoneDigits(phoneInput.trim());
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  ensureValidPhone(phoneInput);
  if (password.trim().length > 0) {
    ensureValidPassword(password);
  }

  const result = await query(
    `SELECT
      id,
      first_name,
      last_name,
      name,
      phone_number,
      birth_date,
      email,
      prayer_request,
      app_role,
      is_active,
      registration_status,
      is_collection_coordinator,
      in_prayer_cycle,
      created_at,
      updated_at,
      password_hash,
      password_reset_required
    FROM members
    WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
    ORDER BY id ASC
    LIMIT 2`,
    [phoneVariants]
  );

  if (result.rows.length > 1) {
    throw new Error('Ambiguous phone number');
  }

  const row = result.rows[0] as (MemberRow & { password_hash: string | null }) | undefined;
  if (!row?.password_hash) {
    return null;
  }

  const reg = normalizeRegistrationStatus(row.registration_status);
  const mayAuthenticate =
    reg === 'rejected' || (row.is_active && (reg === 'active' || reg === 'pending_review'));
  if (!mayAuthenticate) {
    return null;
  }

  if (row.password_reset_required) {
    return {
      status: 'password_reset_required',
      phone_number: row.phone_number ?? phoneInput.trim(),
    };
  }

  if (!password.trim() || !row.password_hash) {
    return null;
  }

  const isPasswordValid = await verifyPassword(password, row.password_hash);
  if (!isPasswordValid) {
    return null;
  }

  const { token, expiresAt } = await createSessionForUser(row.id);
  const user = await getAuthUserById(row.id);
  if (!user) {
    return null;
  }
  return {
    token,
    expires_at: expiresAt,
    user,
  };
}

export async function completePasswordSetupAfterAdminReset(
  phoneInput: string,
  newPassword: string
): Promise<'ok' | 'not_required' | 'not_found'> {
  ensureValidPhone(phoneInput);
  ensureValidPassword(newPassword);
  const member = await findMemberByPhoneDigits(normalizePhoneDigits(phoneInput));
  if (!member) {
    return 'not_found';
  }
  const row = await query(
    `SELECT password_reset_required FROM members WHERE id = $1 LIMIT 1`,
    [member.id]
  );
  const required = Boolean((row.rows[0] as { password_reset_required?: unknown } | undefined)?.password_reset_required);
  if (!required) {
    return 'not_required';
  }
  const newHash = await hashPassword(newPassword);
  await query(
    `UPDATE members
     SET password_hash = $1,
         password_reset_required = FALSE,
         updated_at = NOW()
     WHERE id = $2`,
    [newHash, member.id]
  );
  await query(`DELETE FROM auth_sessions WHERE member_id = $1`, [member.id]);
  return 'ok';
}

export async function resolveSessionByToken(token: string): Promise<SessionPrincipal | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  const accessTtlMinutes = getAccessTtlMinutes();
  const refreshedExpiresAt = new Date(Date.now() + accessTtlMinutes * 60 * 1000);
  const result = await query(
    `UPDATE auth_sessions s
     SET expires_at = $2
     FROM members m
     WHERE s.member_id = m.id
       AND s.token_hash = $1
       AND s.expires_at > NOW()
       AND (
         m.is_active = TRUE
         OR m.registration_status = 'rejected'
       )
    RETURNING m.id AS member_pk, m.app_role, m.app_roles`,
    [tokenHash, refreshedExpiresAt.toISOString()]
  );

  const row = result.rows[0] as
    | { member_pk: number; app_role: string; app_roles?: unknown }
    | undefined;
  if (!row) {
    return null;
  }
  const roles = normalizeAppRoles(row.app_roles, row.app_role);

  return {
    userId: row.member_pk,
    role: normalizeRole(row.app_role),
    roles,
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

export async function revokeRefreshToken(token: string): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return;
  }
  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  await query(
    `UPDATE auth_refresh_sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1`,
    [tokenHash]
  );
}

export async function rotateAccessByRefreshToken(
  refreshToken: string
): Promise<{ token: string; expiresAt: string; refreshToken: string; refreshExpiresAt: string } | null> {
  const normalizedToken = refreshToken.trim();
  if (!normalizedToken) {
    return null;
  }
  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  const sessionResult = await query(
    `SELECT rs.member_id
     FROM auth_refresh_sessions rs
     JOIN members m ON m.id = rs.member_id
     WHERE rs.token_hash = $1
       AND rs.expires_at > NOW()
       AND rs.revoked_at IS NULL
       AND (
         m.is_active = TRUE
         OR m.registration_status = 'rejected'
       )
     LIMIT 1`,
    [tokenHash]
  );
  const row = sessionResult.rows[0] as { member_id: number } | undefined;
  if (!row?.member_id) {
    return null;
  }

  await query(
    `UPDATE auth_refresh_sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1`,
    [tokenHash]
  );
  const { token, expiresAt } = await createSessionForUser(row.member_id);
  const { refreshToken: nextRefreshToken, expiresAt: refreshExpiresAt } = await issueRefreshSessionForUser(
    row.member_id
  );
  return {
    token,
    expiresAt,
    refreshToken: nextRefreshToken,
    refreshExpiresAt,
  };
}

export async function getAuthUserById(userId: number): Promise<AuthUser | null> {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getPrayerCycleSnapshotForDate(today);
  const ci = snap?.cycle_index ?? 0;

  const result = await query(
    `SELECT
      m.id,
      m.user_id,
      m.first_name,
      m.last_name,
      m.name,
      m.avatar_url,
      m.public_key,
      m.phone_number,
      m.ministry_role,
      m.ministry_direction,
      m.birth_date,
      m.email,
      COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
      m.app_role,
      m.app_roles,
      m.is_active,
      m.registration_status,
      m.is_collection_coordinator,
      m.in_prayer_cycle,
      m.created_at,
      m.updated_at,
      COALESCE(NULLIF(TRIM(up.username), ''), 'member-' || m.id::text) AS profile_username
    FROM members m
    LEFT JOIN user_profiles up ON up.member_id = m.id
    LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = $2
    WHERE m.id = $1
      AND (
        m.is_active = TRUE
        OR m.registration_status = 'rejected'
      )
    LIMIT 1`,
    [userId, ci]
  );

  const row = result.rows[0] as MemberRow | undefined;
  if (!row) {
    return null;
  }
  const user = mapAuthUser(row);
  return {
    ...user,
    prayer_cycle: snap ? toPublicCycleInfo(snap) : null,
  };
}

export async function updateAuthUserAvatar(
  userId: number,
  avatarUrl: string | null,
): Promise<AuthUser | null> {
  await query(`UPDATE members SET avatar_url = $1, updated_at = NOW() WHERE id = $2`, [
    avatarUrl,
    userId,
  ]);
  return getAuthUserById(userId);
}

export async function updateAuthUserProfile(
  userId: number,
  input: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    ministry_role?: string;
    ministry_direction?: string;
    birth_date?: string;
    email?: string;
    prayer_request?: string;
    public_key?: string;
  }
): Promise<AuthUser | null> {
  const updated = await updateUser(userId, input);
  if (!updated) {
    return null;
  }
  return getAuthUserById(userId);
}

export async function changeMemberPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<'ok' | 'wrong_password' | 'no_password' | 'weak_password'> {
  try {
    ensureValidPassword(newPassword);
  } catch {
    return 'weak_password';
  }
  const result = await query(
    `SELECT password_hash FROM members WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [userId]
  );
  const row = result.rows[0] as { password_hash: string | null } | undefined;
  const hash = row?.password_hash;
  if (!hash) {
    return 'no_password';
  }
  if (!(await verifyPassword(currentPassword, hash))) {
    return 'wrong_password';
  }
  const newHash = await hashPassword(newPassword);
  await query(`UPDATE members SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
    newHash,
    userId,
  ]);
  return 'ok';
}

export async function changeMemberPhone(
  userId: number,
  currentPassword: string,
  newPhoneNumber: string
): Promise<'ok' | 'wrong_password' | 'no_password' | 'phone_taken' | 'invalid_phone'> {
  try {
    ensureValidPhone(newPhoneNumber);
  } catch {
    return 'invalid_phone';
  }

  const result = await query(
    `SELECT password_hash FROM members WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [userId]
  );
  const row = result.rows[0] as { password_hash: string | null } | undefined;
  const hash = row?.password_hash;
  if (!hash) {
    return 'no_password';
  }
  if (!(await verifyPassword(currentPassword, hash))) {
    return 'wrong_password';
  }

  const phoneDigits = normalizePhoneDigits(newPhoneNumber);
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  const conflict = await query(
    `SELECT id
     FROM members
     WHERE is_active = TRUE
       AND id <> $2
       AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
     LIMIT 1`,
    [phoneVariants, userId]
  );
  if (conflict.rows[0]?.id) {
    return 'phone_taken';
  }

  await query(
    `UPDATE members SET phone_number = $1, updated_at = NOW() WHERE id = $2 AND is_active = TRUE`,
    [normalizePhoneInput(newPhoneNumber), userId]
  );
  return 'ok';
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
      request_type,
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

async function resolveMemberForAccessRequestIdentity(requestRow: {
  first_name: string;
  last_name: string;
  full_name: string;
  phone_digits: string;
}): Promise<MemberRow | null> {
  let existingMember: MemberRow | null = await findMemberByIdentity(
    requestRow.first_name,
    requestRow.last_name,
    requestRow.full_name,
    requestRow.phone_digits
  );

  if (!existingMember) {
    const conflictId = await findMemberIdConflictingName(requestRow.first_name, requestRow.last_name);
    if (conflictId != null) {
      const conflictResult = await query(
        `SELECT
          id,
          user_id,
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
        WHERE id = $1
        LIMIT 1`,
        [conflictId]
      );
      existingMember = (conflictResult.rows[0] as MemberRow | undefined) ?? null;
    }
  }

  if (!existingMember) {
    const byPhone = await findMemberByPhoneDigits(requestRow.phone_digits);
    if (byPhone && isInputNameMatchingMember(byPhone, requestRow.first_name, requestRow.last_name)) {
      existingMember = byPhone;
    }
  }

  return existingMember;
}

export type ApproveAccessRequestAppRoleChoice = 'member' | 'parishioner';

export async function approveAccessRequest(
  requestId: number,
  reviewerId: number,
  reviewNote?: string,
  options?: { app_role?: ApproveAccessRequestAppRoleChoice },
): Promise<AuthUser | null> {
  const assignParishioner = options?.app_role === 'parishioner';

  const requestResult = await query(
    `SELECT
      id,
      first_name,
      last_name,
      full_name,
      phone_number,
      phone_digits,
      password_hash,
      request_type,
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
        request_type: AccessRequestType;
        status: AccessRequestStatus;
        member_id: number | null;
      }
    | undefined;

  if (!requestRow || requestRow.status !== 'pending') {
    return null;
  }

  const existingMember = await resolveMemberForAccessRequestIdentity(requestRow);

  let member: MemberRow;
  if (requestRow.request_type === 'password_reset') {
    if (!existingMember) {
      return null;
    }
    const updated = await query(
      `UPDATE members
       SET
        password_hash = $1,
        is_active = TRUE,
        updated_at = NOW()
       WHERE id = $2
       RETURNING
        id,
        user_id,
        first_name,
        last_name,
        name,
        phone_number,
        birth_date,
        email,
        prayer_request,
        app_role,
        is_active,
        registration_status,
        is_collection_coordinator,
        in_prayer_cycle,
        created_at,
        updated_at`,
      [requestRow.password_hash, existingMember.id]
    );
    member = updated.rows[0] as MemberRow;
  } else if (requestRow.request_type === 'registration' && requestRow.member_id != null) {
    const updated = assignParishioner
      ? await query(
          `UPDATE members
           SET
            first_name = $1,
            last_name = $2,
            name = $3,
            phone_number = $4,
            password_hash = $5,
            registration_status = 'active',
            is_active = TRUE,
            app_role = 'parishioner',
            app_roles = ARRAY['parishioner']::text[],
            updated_at = NOW()
           WHERE id = $6
           RETURNING
            id,
            user_id,
            first_name,
            last_name,
            name,
            phone_number,
            birth_date,
            email,
            prayer_request,
            app_role,
            is_active,
            registration_status,
            is_collection_coordinator,
            in_prayer_cycle,
            created_at,
            updated_at`,
          [
            requestRow.first_name,
            requestRow.last_name,
            requestRow.full_name,
            requestRow.phone_number,
            requestRow.password_hash,
            requestRow.member_id,
          ],
        )
      : await query(
          `UPDATE members
           SET
            first_name = $1,
            last_name = $2,
            name = $3,
            phone_number = $4,
            password_hash = $5,
            registration_status = 'active',
            is_active = TRUE,
            app_role = COALESCE(NULLIF(app_role, ''), 'member'),
            updated_at = NOW()
           WHERE id = $6
           RETURNING
            id,
            user_id,
            first_name,
            last_name,
            name,
            phone_number,
            birth_date,
            email,
            prayer_request,
            app_role,
            is_active,
            registration_status,
            is_collection_coordinator,
            in_prayer_cycle,
            created_at,
            updated_at`,
          [
            requestRow.first_name,
            requestRow.last_name,
            requestRow.full_name,
            requestRow.phone_number,
            requestRow.password_hash,
            requestRow.member_id,
          ],
        );
    member = updated.rows[0] as MemberRow;
  } else if (existingMember) {
    const updated = assignParishioner
      ? await query(
          `UPDATE members
           SET
            first_name = $1,
            last_name = $2,
            name = $3,
            phone_number = $4,
            password_hash = $5,
            app_role = 'parishioner',
            app_roles = ARRAY['parishioner']::text[],
            registration_status = 'active',
            is_active = TRUE,
            updated_at = NOW()
           WHERE id = $6
           RETURNING
            id,
            user_id,
            first_name,
            last_name,
            name,
            phone_number,
            birth_date,
            email,
            prayer_request,
            app_role,
            is_active,
            registration_status,
            is_collection_coordinator,
            in_prayer_cycle,
            created_at,
            updated_at`,
          [
            requestRow.first_name,
            requestRow.last_name,
            requestRow.full_name,
            requestRow.phone_number,
            requestRow.password_hash,
            existingMember.id,
          ],
        )
      : await query(
          `UPDATE members
           SET
            first_name = $1,
            last_name = $2,
            name = $3,
            phone_number = $4,
            password_hash = $5,
            app_role = COALESCE(NULLIF(app_role, ''), 'member'),
            registration_status = 'active',
            is_active = TRUE,
            updated_at = NOW()
           WHERE id = $6
           RETURNING
            id,
            user_id,
            first_name,
            last_name,
            name,
            phone_number,
            birth_date,
            email,
            prayer_request,
            app_role,
            is_active,
            registration_status,
            is_collection_coordinator,
            in_prayer_cycle,
            created_at,
            updated_at`,
          [
            requestRow.first_name,
            requestRow.last_name,
            requestRow.full_name,
            requestRow.phone_number,
            requestRow.password_hash,
            existingMember.id,
          ],
        );
    member = updated.rows[0] as MemberRow;
  } else {
    const inserted = assignParishioner
      ? await query(
          `INSERT INTO members
            (first_name, last_name, name, phone_number, password_hash, app_role, app_roles, is_active, registration_status, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'parishioner', ARRAY['parishioner']::text[], TRUE, 'active', NOW())
           RETURNING
            id,
            user_id,
            first_name,
            last_name,
            name,
            phone_number,
            birth_date,
            email,
            prayer_request,
            app_role,
            is_active,
            registration_status,
            is_collection_coordinator,
            in_prayer_cycle,
            created_at,
            updated_at`,
          [
            requestRow.first_name,
            requestRow.last_name,
            requestRow.full_name,
            requestRow.phone_number,
            requestRow.password_hash,
          ],
        )
      : await query(
          `INSERT INTO members
            (first_name, last_name, name, phone_number, password_hash, app_role, is_active, registration_status, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'member', TRUE, 'active', NOW())
           RETURNING
            id,
            user_id,
            first_name,
            last_name,
            name,
            phone_number,
            birth_date,
            email,
            prayer_request,
            app_role,
            is_active,
            registration_status,
            is_collection_coordinator,
            in_prayer_cycle,
            created_at,
            updated_at`,
          [
            requestRow.first_name,
            requestRow.last_name,
            requestRow.full_name,
            requestRow.phone_number,
            requestRow.password_hash,
          ],
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

  const approved = await getAuthUserById(member.id);
  if (!approved) {
    throw new Error('Member not found after approval');
  }
  return approved;
}

export async function rejectAccessRequest(
  requestId: number,
  reviewerId: number,
  reviewNote?: string
): Promise<boolean> {
  const pendingRow = await query(
    `SELECT member_id FROM access_requests WHERE id = $1 AND status = 'pending' LIMIT 1`,
    [requestId]
  );
  const linkedMemberId = pendingRow.rows[0]?.member_id as number | null | undefined;

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

  const ok = (result.rowCount ?? 0) > 0;
  if (ok && linkedMemberId != null && Number.isFinite(Number(linkedMemberId))) {
    await query(
      `UPDATE members
       SET registration_status = 'rejected', is_active = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [linkedMemberId]
    );
  }

  return ok;
}
