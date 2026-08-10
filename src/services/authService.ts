import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { query } from '../config/db';
import { getPrayerCycleTodayYmd } from '../utils/prayerPlanTimeZone';
import type { PrayerCyclePublic } from './prayerCycleService';
import { getPrayerCycleSnapshotForDate, toPublicCycleInfo, buildCyclePrayerMpcPickSql } from './prayerCycleService';
import type { AppRole } from '../types/appRole';
import { normalizeAppRole, normalizeAppRoles } from '../types/appRole';
import { findMemberIdConflictingName, updateUser } from './userService';
import { postRegistrationAccessRequestMessengerNotification } from './messengerService';
import { notifyMembersAboutNewJoiner } from './memberJoinedNotifyService';
import { writeAppLog } from './appLogService';
import { resolveSmsRuntimeConfig } from './smsSettingsService';
import { sendPasswordResetTelegramMessage } from './telegramService';
import type { RefreshRotationRedisPayload } from './authSessionRedis';
import {
  markAccessTokenRevokedInRedis,
  isAccessTokenRevokedInRedis,
  rememberRefreshRotationGraceInRedis,
  releaseRefreshRotationLock,
  sleepMs,
  takeRefreshRotationGraceFromRedis,
  tryAcquireRefreshRotationLock,
} from './authSessionRedis';
import {
  logSessionInvalidated,
  type RefreshFailureReason,
  type SessionAuditContext,
  type SessionInvalidationReason,
} from '../lib/sessionAuditLog';
import { coerceBirthDateToYmd } from '../lib/birthDate';

const scrypt = promisify(scryptCallback);
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_ACCESS_TTL_MINUTES = 60;
const MIN_ACCESS_TTL_MINUTES = 1;
const MAX_ACCESS_TTL_MINUTES = 24 * 60;
const DEFAULT_REFRESH_TTL_DAYS = 90;
const MIN_REFRESH_TTL_DAYS = 1;
const MAX_REFRESH_TTL_DAYS = 365;
/** Ротации access-токена (много записей на одного пользователя) — не путать с числом устройств. */
const DEFAULT_MAX_ACCESS_SESSIONS_PER_USER = 30;
/** Активные refresh (по сути «сколько устройств может остаться в системе»). */
const DEFAULT_MAX_REFRESH_SESSIONS_PER_USER = 15;
const MIN_SESSION_SLOTS_PER_USER = 1;
const MAX_SESSION_SLOTS_PER_USER = 100;
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
  birth_date: string;
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

export type SessionResolutionFailureReason = 'expired' | 'revoked' | 'not_found';

export type SessionResolution =
  | { principal: SessionPrincipal }
  | {
      principal: null;
      reason: SessionResolutionFailureReason;
      memberId?: number | null;
    };

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

  // Российские номера: в БД часто 10 цифр (902…), в форме — +7 (902)… → 7902…
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const national = digits.slice(1);
    if (national.length === 10) {
      variants.add(national);
      variants.add(`7${national}`);
      variants.add(`8${national}`);
    }
  }
  if (digits.length === 10) {
    variants.add(`7${digits}`);
    variants.add(`8${digits}`);
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

function envSessionLimit(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v === null) {
    return undefined;
  }
  const t = String(v).trim();
  return t === '' ? undefined : t;
}

function clampSessionSlots(n: number): number {
  return Math.min(MAX_SESSION_SLOTS_PER_USER, Math.max(MIN_SESSION_SLOTS_PER_USER, n));
}

function parseSessionSlots(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampSessionSlots(Math.floor(parsed));
}

function getMaxAccessSessionsPerUser(): number {
  const raw =
    envSessionLimit('AUTH_MAX_ACCESS_SESSIONS_PER_USER') ??
    envSessionLimit('AUTH_MAX_ACTIVE_SESSIONS_PER_USER');
  return parseSessionSlots(raw, DEFAULT_MAX_ACCESS_SESSIONS_PER_USER);
}

function getMaxRefreshSessionsPerUser(): number {
  const raw =
    envSessionLimit('AUTH_MAX_REFRESH_SESSIONS_PER_USER') ??
    envSessionLimit('AUTH_MAX_ACTIVE_SESSIONS_PER_USER');
  return parseSessionSlots(raw, DEFAULT_MAX_REFRESH_SESSIONS_PER_USER);
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
    birth_date: coerceBirthDateToYmd(row.birth_date),
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
  const maxAccessSlots = getMaxAccessSessionsPerUser();
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

  // Лишние access-сессии (частые ротации); лимит выше, чем у refresh — чтобы не выбивать другие устройства.
  const prunedAccess = await query(
    `DELETE FROM auth_sessions
     WHERE member_id = $1
       AND token_hash IN (
         SELECT token_hash
         FROM auth_sessions
         WHERE member_id = $1
         ORDER BY created_at DESC, token_hash DESC
         OFFSET $2
       )`,
    [userId, maxAccessSlots]
  );
  if ((prunedAccess.rowCount ?? 0) > 0) {
    logSessionInvalidated('limit_exceeded', userId);
  }

  return { token, expiresAt: expiresAt.toISOString() };
}

function createRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(64).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

/** При SKIP_DB_INIT колонка может отсутствовать — один раз применяем DDL из миграции. */
let ensureLastUsedAtColumnPromise: Promise<void> | null = null;

function ensureAuthRefreshSessionsLastUsedAtColumn(): Promise<void> {
  if (!ensureLastUsedAtColumnPromise) {
    ensureLastUsedAtColumnPromise = (async (): Promise<void> => {
      await query(
        `ALTER TABLE auth_refresh_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`,
      );
      await query(
        `UPDATE auth_refresh_sessions SET last_used_at = created_at WHERE last_used_at IS NULL`,
      );
      await query(
        `ALTER TABLE auth_refresh_sessions ALTER COLUMN last_used_at SET DEFAULT NOW()`,
      );
      try {
        await query(
          `ALTER TABLE auth_refresh_sessions ALTER COLUMN last_used_at SET NOT NULL`,
        );
      } catch {
        /* уже NOT NULL или гонка — не блокируем вход */
      }
    })().catch((err: unknown) => {
      ensureLastUsedAtColumnPromise = null;
      throw err;
    });
  }
  return ensureLastUsedAtColumnPromise;
}

/** Новая пара access+refresh (без refresh cookie — восстановление iOS PWA по Bearer access). */
export async function reissueSessionForUser(
  userId: number
): Promise<{
  token: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}> {
  const { token, expiresAt } = await createSessionForUser(userId);
  const { refreshToken, expiresAt: refreshExpiresAt } = await issueRefreshSessionForUser(userId);
  return { token, expiresAt, refreshToken, refreshExpiresAt };
}

export async function issueRefreshSessionForUser(
  userId: number
): Promise<{ refreshToken: string; expiresAt: string }> {
  await ensureAuthRefreshSessionsLastUsedAtColumn();
  const { token, tokenHash } = createRefreshToken();
  const refreshTtlDays = getRefreshTtlDays();
  const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
  const maxRefreshSlots = getMaxRefreshSessionsPerUser();

  await query(
    `DELETE FROM auth_refresh_sessions
     WHERE member_id = $1
       AND (expires_at <= NOW() OR revoked_at IS NOT NULL)`,
    [userId]
  );

  await query(
    `INSERT INTO auth_refresh_sessions (token_hash, member_id, expires_at, last_used_at)
     VALUES ($1, $2, $3, NOW())`,
    [tokenHash, userId, expiresAt.toISOString()]
  );

  const prunedRefresh = await query(
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
    [userId, maxRefreshSlots]
  );
  if ((prunedRefresh.rowCount ?? 0) > 0) {
    logSessionInvalidated('limit_exceeded', userId);
  }

  return { refreshToken: token, expiresAt: expiresAt.toISOString() };
}

async function invalidateMemberSessions(
  memberId: number,
  reason: SessionInvalidationReason,
  audit?: SessionAuditContext,
): Promise<void> {
  await query(`DELETE FROM auth_sessions WHERE member_id = $1`, [memberId]);
  await query(
    `UPDATE auth_refresh_sessions
     SET revoked_at = NOW()
     WHERE member_id = $1
       AND revoked_at IS NULL`,
    [memberId],
  );
  logSessionInvalidated(reason, memberId, audit);
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
  const birthDate = input.birth_date.trim();

  ensureValidName(firstName, lastName);
  ensureValidPhone(phoneNumber);
  ensureValidPassword(input.password);
  if (!birthDate) {
    throw new Error('Invalid birth date');
  }

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
        birth_date = $6,
        app_role = COALESCE(NULLIF(app_role, ''), 'member'),
        is_active = TRUE,
        updated_at = NOW()
       WHERE id = $7
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
      [firstName, lastName, fullName, phoneNumber, passwordHash, birthDate, matchedMember.id]
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
          birth_date = $6,
          app_role = COALESCE(NULLIF(app_role, ''), 'member'),
          is_active = TRUE,
          updated_at = NOW()
         WHERE id = $7
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
        [firstName, lastName, fullName, phoneNumber, passwordHash, birthDate, dupRow.id]
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
       first_name, last_name, name, phone_number, password_hash, birth_date, app_role,
       is_active, registration_status, in_prayer_cycle, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'member', TRUE, 'pending_review', FALSE, NOW())
     RETURNING id`,
    [firstName, lastName, fullName, phoneNumber, passwordHash, birthDate]
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
  await invalidateMemberSessions(member.id, 'password_changed');
  await query(
    `UPDATE password_reset_sms_codes
     SET consumed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [row.id]
  );
  void writeAppLog({
    level: 'info',
    scope: 'auth',
    event: 'auth.password_reset_sms',
    message: 'Пароль сброшен по SMS',
    user_id: member.id,
    context: {},
  });
}

export async function loginUser(phoneInput: string, password: string): Promise<LoginAttemptResult | null> {
  const phoneDigits = normalizePhoneDigits(phoneInput.trim());
  const phoneVariants = getPhoneDigitsVariants(phoneDigits);
  ensureValidPhone(phoneInput);

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
  if (!row) {
    return null;
  }

  const reg = normalizeRegistrationStatus(row.registration_status);
  const mayAuthenticate =
    reg === 'rejected' || (row.is_active && (reg === 'active' || reg === 'pending_review'));
  if (!mayAuthenticate) {
    return null;
  }

  // Must run before `!password_hash` check: admin reset clears the hash and sets this flag.
  if (row.password_reset_required) {
    return {
      status: 'password_reset_required',
      phone_number: row.phone_number ?? phoneInput.trim(),
    };
  }

  if (!row.password_hash) {
    return null;
  }

  if (!password.trim()) {
    return null;
  }

  ensureValidPassword(password);

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
  await invalidateMemberSessions(member.id, 'password_changed');
  return 'ok';
}

type AccessSessionDiagRow = {
  member_id: number;
  expires_at: string;
  eligible: boolean;
};

async function lookupAccessSessionDiag(tokenHash: string): Promise<AccessSessionDiagRow | null> {
  const result = await query(
    `SELECT s.member_id,
            s.expires_at,
            (m.is_active = TRUE OR m.registration_status = 'rejected') AS eligible
     FROM auth_sessions s
     JOIN members m ON m.id = s.member_id
     WHERE s.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0] as AccessSessionDiagRow | undefined;
  return row ?? null;
}

export async function resolveSessionByToken(token: string): Promise<SessionResolution> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { principal: null, reason: 'not_found' };
  }

  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  if (await isAccessTokenRevokedInRedis(tokenHash)) {
    const diag = await lookupAccessSessionDiag(tokenHash);
    return {
      principal: null,
      reason: 'revoked',
      memberId: diag?.member_id ?? null,
    };
  }

  const accessTtlMinutes = getAccessTtlMinutes();
  const refreshedExpiresAt = new Date(Date.now() + accessTtlMinutes * 60 * 1000);
  const halfTtlMinutes = accessTtlMinutes * 0.5;
  const result = await query(
    `UPDATE auth_sessions s
     SET expires_at = CASE
       WHEN s.expires_at < NOW() + (($3::double precision) * INTERVAL '1 minute') THEN $2::timestamptz
       ELSE s.expires_at
     END
     FROM members m
     WHERE s.member_id = m.id
       AND s.token_hash = $1
       AND s.expires_at > NOW()
       AND (
         m.is_active = TRUE
         OR m.registration_status = 'rejected'
       )
    RETURNING m.id AS member_pk, m.app_role, m.app_roles`,
    [tokenHash, refreshedExpiresAt.toISOString(), halfTtlMinutes],
  );

  const row = result.rows[0] as
    | { member_pk: number; app_role: string; app_roles?: unknown }
    | undefined;
  if (row) {
    const roles = normalizeAppRoles(row.app_roles, row.app_role);
    return {
      principal: {
        userId: row.member_pk,
        role: normalizeRole(row.app_role),
        roles,
        tokenHash,
      },
    };
  }

  const diag = await lookupAccessSessionDiag(tokenHash);
  if (!diag) {
    return { principal: null, reason: 'not_found' };
  }
  if (new Date(diag.expires_at).getTime() <= Date.now()) {
    return { principal: null, reason: 'expired', memberId: diag.member_id };
  }
  if (!diag.eligible) {
    return { principal: null, reason: 'not_found' };
  }
  return { principal: null, reason: 'not_found' };
}

export async function logoutByToken(
  token: string,
  options?: { memberId?: number; audit?: SessionAuditContext },
): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return;
  }

  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  const sessionRow = await query(
    `SELECT member_id FROM auth_sessions WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  const resolvedMemberId =
    options?.memberId ??
    (sessionRow.rows[0] as { member_id: number } | undefined)?.member_id ??
    null;

  const revokeTtlSec = getAccessTtlMinutes() * 60 + 120;
  await markAccessTokenRevokedInRedis(tokenHash, revokeTtlSec);
  await query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
  if (resolvedMemberId != null) {
    logSessionInvalidated('manual_logout', resolvedMemberId, options?.audit);
  }
}

export async function diagnoseRefreshTokenFailure(refreshToken: string): Promise<RefreshFailureReason> {
  const normalizedToken = refreshToken.trim();
  if (!normalizedToken) {
    return 'token_not_found';
  }
  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
  const result = await query(
    `SELECT expires_at, revoked_at, member_id
     FROM auth_refresh_sessions
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0] as
    | { expires_at: string; revoked_at: string | null; member_id: number }
    | undefined;
  if (!row) {
    return 'token_not_found';
  }
  if (row.revoked_at) {
    return 'already_revoked';
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return 'expired';
  }
  const memberCheck = await query(
    `SELECT id
     FROM members
     WHERE id = $1
       AND (is_active = TRUE OR registration_status = 'rejected')
     LIMIT 1`,
    [row.member_id],
  );
  if (!memberCheck.rows[0]) {
    return 'token_not_found';
  }
  return 'token_not_found';
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

/** Фоновая уборка: протухшие access, refresh и давно неиспользуемые refresh (idle). */
export async function cleanupExpiredSessions(): Promise<{
  deletedAccess: number;
  deletedRefresh: number;
}> {
  await ensureAuthRefreshSessionsLastUsedAtColumn();
  const access = await query(`DELETE FROM auth_sessions WHERE expires_at < NOW() - INTERVAL '1 day'`);
  const refresh = await query(
    `DELETE FROM auth_refresh_sessions
     WHERE (expires_at < NOW() - INTERVAL '1 day')
        OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '90 days')
        OR (revoked_at IS NULL AND last_used_at < NOW() - INTERVAL '30 days')`,
  );
  return {
    deletedAccess: access.rowCount ?? 0,
    deletedRefresh: refresh.rowCount ?? 0,
  };
}

type RefreshRotationResult = {
  token: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  memberId: number;
};

/** Повтор тем же refresh сразу после ротации (две вкладки / повтор запроса). */
const REFRESH_ROTATION_GRACE_MS = 60_000;
const MAX_REFRESH_GRACE_MAP_SIZE = 5000;

const refreshRotationGraceByHash = new Map<string, { payload: RefreshRotationResult; until: number }>();

/** Параллельные POST /refresh с одним cookie — один расчёт, общий результат. */
const pendingRefreshByHash = new Map<string, Promise<RefreshRotationResult | null>>();

function pruneRefreshRotationGrace(): void {
  const now = Date.now();
  for (const [k, v] of refreshRotationGraceByHash) {
    if (now > v.until) {
      refreshRotationGraceByHash.delete(k);
    }
  }
  if (refreshRotationGraceByHash.size > MAX_REFRESH_GRACE_MAP_SIZE) {
    const target = Math.floor(MAX_REFRESH_GRACE_MAP_SIZE * 0.7);
    for (const k of refreshRotationGraceByHash.keys()) {
      refreshRotationGraceByHash.delete(k);
      if (refreshRotationGraceByHash.size <= target) {
        break;
      }
    }
  }
}

function takeRefreshRotationGrace(tokenHash: string): RefreshRotationResult | null {
  pruneRefreshRotationGrace();
  const row = refreshRotationGraceByHash.get(tokenHash);
  if (!row) {
    return null;
  }
  if (Date.now() > row.until) {
    refreshRotationGraceByHash.delete(tokenHash);
    return null;
  }
  return row.payload;
}

function rememberRefreshRotationGrace(tokenHash: string, payload: RefreshRotationResult): void {
  pruneRefreshRotationGrace();
  refreshRotationGraceByHash.set(tokenHash, {
    payload,
    until: Date.now() + REFRESH_ROTATION_GRACE_MS,
  });
  void rememberRefreshRotationGraceInRedis(tokenHash, {
    token: payload.token,
    expiresAt: payload.expiresAt,
    refreshToken: payload.refreshToken,
    refreshExpiresAt: payload.refreshExpiresAt,
    memberId: payload.memberId,
  });
}

async function rotateAccessByRefreshTokenOnce(
  tokenHash: string,
  memberId: number
): Promise<RefreshRotationResult> {
  await ensureAuthRefreshSessionsLastUsedAtColumn();
  await query(
    `UPDATE auth_refresh_sessions
     SET last_used_at = NOW()
     WHERE token_hash = $1
       AND revoked_at IS NULL`,
    [tokenHash]
  );
  await query(
    `UPDATE auth_refresh_sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1`,
    [tokenHash]
  );
  const { token, expiresAt } = await createSessionForUser(memberId);
  const { refreshToken: nextRefreshToken, expiresAt: refreshExpiresAt } = await issueRefreshSessionForUser(
    memberId
  );
  const result: RefreshRotationResult = {
    token,
    expiresAt,
    refreshToken: nextRefreshToken,
    refreshExpiresAt,
    memberId,
  };
  rememberRefreshRotationGrace(tokenHash, result);
  return result;
}

function mapRedisGraceToRotation(g: RefreshRotationRedisPayload): RefreshRotationResult {
  return {
    token: g.token,
    expiresAt: g.expiresAt,
    refreshToken: g.refreshToken,
    refreshExpiresAt: g.refreshExpiresAt,
    memberId: g.memberId,
  };
}

export async function rotateAccessByRefreshToken(
  refreshToken: string
): Promise<RefreshRotationResult | null> {
  const normalizedToken = refreshToken.trim();
  if (!normalizedToken) {
    return null;
  }
  const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');

  const graceRedis = await takeRefreshRotationGraceFromRedis(tokenHash);
  if (graceRedis) {
    return mapRedisGraceToRotation(graceRedis);
  }
  const grace = takeRefreshRotationGrace(tokenHash);
  if (grace) {
    return grace;
  }

  const lockAttempt = await tryAcquireRefreshRotationLock(tokenHash);
  if (lockAttempt === null) {
    let inflight = pendingRefreshByHash.get(tokenHash);
    if (!inflight) {
      inflight = (async (): Promise<RefreshRotationResult | null> => {
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
          return takeRefreshRotationGrace(tokenHash);
        }
        return rotateAccessByRefreshTokenOnce(tokenHash, row.member_id);
      })().finally(() => {
        pendingRefreshByHash.delete(tokenHash);
      });
      pendingRefreshByHash.set(tokenHash, inflight);
    }
    return inflight;
  }

  if (!lockAttempt) {
    for (let i = 0; i < 200; i++) {
      await sleepMs(50);
      const gR = await takeRefreshRotationGraceFromRedis(tokenHash);
      if (gR) {
        return mapRedisGraceToRotation(gR);
      }
      const gM = takeRefreshRotationGrace(tokenHash);
      if (gM) {
        return gM;
      }
    }
    const tailR = await takeRefreshRotationGraceFromRedis(tokenHash);
    if (tailR) {
      return mapRedisGraceToRotation(tailR);
    }
    const tailM = takeRefreshRotationGrace(tokenHash);
    return tailM ?? null;
  }

  try {
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
      const ar = await takeRefreshRotationGraceFromRedis(tokenHash);
      if (ar) {
        return mapRedisGraceToRotation(ar);
      }
      return takeRefreshRotationGrace(tokenHash);
    }
    return rotateAccessByRefreshTokenOnce(tokenHash, row.member_id);
  } finally {
    await releaseRefreshRotationLock(tokenHash);
  }
}

export async function getAuthUserById(userId: number): Promise<AuthUser | null> {
  const snap = await getPrayerCycleSnapshotForDate(getPrayerCycleTodayYmd());
  const ci = snap?.cycle_index ?? 0;
  const mpcPick = buildCyclePrayerMpcPickSql('$2');

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
      m.birth_date::text AS birth_date,
      m.email,
      ${mpcPick.prayerRequest} AS prayer_request,
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
  newPassword: string,
  audit?: SessionAuditContext,
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
  await invalidateMemberSessions(userId, 'password_changed', audit);
  void writeAppLog({
    level: 'info',
    scope: 'auth',
    event: 'auth.password_changed',
    message: 'Пароль изменён',
    user_id: userId,
    context: {},
  });
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

  // Социальный пуш только при одобрении новой регистрации (не password_reset).
  if (requestRow.request_type === 'registration') {
    void notifyMembersAboutNewJoiner({
      id: approved.id,
      first_name: approved.first_name,
      last_name: approved.last_name,
      name: approved.name,
    }).catch((e) => {
      console.warn('[auth] notifyMembersAboutNewJoiner failed:', e);
    });
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
