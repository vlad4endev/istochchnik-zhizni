import { Request, Response } from 'express';
import {
  AppRole,
  createMinistryDirectionTemplate,
  createMinistryRoleTemplate,
  bulkCreateUsers,
  createUser,
  deleteMinistryDirectionTemplate,
  deleteMinistryRoleTemplate,
  deleteUser,
  getUserById,
  linkUserAccount,
  listMinistryDirectionTemplates,
  listPrayerRequestHistory,
  addPrayerRequestHistoryManual,
  adminForceResetMemberPassword,
  listMinistryRoleTemplates,
  listUsers,
  MemberNameDuplicateError,
  setMinistryDirectionTemplateRoles,
  anchorPrayerCycleMemberOnDate,
  getPrayerCycleRosterSnapshot,
  savePrayerCycleRosterCustomOrderForAnchorDate,
  setOneTimeMemberDateOverride,
  setUserAppRoles,
  startPrayerCycle,
  swapAllMembersFirstLastNames,
  swapMemberFirstLastName,
  updateUser,
} from '../services/userService';
import { isValidAppRoleString } from '../types/appRole';
import { notifyRealtime, type RealtimeScope } from '../realtime/notify';
import { mergeAllDuplicateMembers } from '../services/memberMergeService';
import { syncMembersTelegramProfiles } from '../services/telegramService';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string };

function ensureAuthenticated(req: Request, res: Response): AuthRequest | null {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return null;
  }
  return r;
}

function ensureAdmin(req: Request, res: Response): AuthRequest | null {
  const r = ensureAuthenticated(req, res);
  if (!r) {
    return null;
  }
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  return r;
}

function parseUserId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isValidDateInput(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Принимает YYYY-MM-DD или ISO (…T00:00:00.000Z); возвращает проверенную YYYY-MM-DD или null. */
function coerceToYmd(value: string): string | null {
  const t = value.trim();
  if (t.length < 10) {
    return null;
  }
  const ymd = t.slice(0, 10);
  return isValidDateInput(ymd) ? ymd : null;
}

function isValidPhoneInput(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (normalized.length < 7 || normalized.length > 20) {
    return false;
  }

  const phonePattern = /^[0-9+\-() ]+$/;
  return phonePattern.test(normalized);
}

function isValidOptionalShortString(value: unknown, maxLength = 120): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim().length <= maxLength;
}

function isValidAppRole(value: unknown): value is AppRole {
  return isValidAppRoleString(value);
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  try {
    const users = await listUsers();
    res.json(users);
  } catch (error) {
    console.error('Failed to fetch users', error);
    res.status(500).json({ error: 'Database error' });
  }
}

/** Объединяет дубликаты участников (одинаковое ФИО), оставляя старую карточку. Только админ. */
export async function mergeDuplicateMembersHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  try {
    const result = await mergeAllDuplicateMembers();
    notifyRealtime(['members', 'calendar']);
    res.json({ ok: true, mergedPairs: result.mergedPairs });
  } catch (error) {
    console.error('Failed to merge duplicate members', error);
    res.status(500).json({ error: 'Не удалось объединить дубликаты' });
  }
}

/** Меняет местами имя и фамилию у всех участников. Повторный запуск откатывает изменение. Только админ. */
export async function swapAllMembersFirstLastNamesHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  try {
    const { updated, swapped, filledFromName } = await swapAllMembersFirstLastNames();
    console.info('[users] swap-all-first-last-names:', { updated, swapped, filledFromName });
    notifyRealtime(['members', 'calendar']);
    res.json({ ok: true, updated, swapped, filledFromName });
  } catch (error) {
    console.error('Failed to swap all member name columns', error);
    res.status(500).json({ error: 'Не удалось обновить участников' });
  }
}

/** Массово подтягивает аватары/телефоны пользователей из Telegram по telegram_chat_id. Только админ. */
export async function syncUsersTelegramProfilesHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  try {
    const result = await syncMembersTelegramProfiles();
    notifyRealtime(['members']);
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'telegram_missing_token') {
      res.status(400).json({ error: 'Не задан Telegram Bot Token' });
      return;
    }
    if (message === 'telegram_bot_token_invalid_chars') {
      res.status(400).json({ error: 'Токен содержит недопустимые символы' });
      return;
    }
    console.error('Failed to sync users from Telegram profiles', error);
    res.status(500).json({ error: 'Не удалось обновить пользователей из Telegram' });
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const auth = ensureAuthenticated(req, res);
  if (!auth) {
    return;
  }
  if (auth.authUserRole !== 'admin' && auth.authUserId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error('Failed to fetch user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getPrayerRequestHistoryHandler(req: Request, res: Response): Promise<void> {
  const authReq = ensureAuthenticated(req, res);
  if (!authReq) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  if (authReq.authUserRole !== 'admin' && authReq.authUserId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const limitRaw = req.query.limit;
  const parsedLimit =
    typeof limitRaw === 'string' && Number.isInteger(Number(limitRaw))
      ? Number(limitRaw)
      : 20;

  try {
    const history = await listPrayerRequestHistory(userId, parsedLimit);
    res.json(history);
  } catch (error) {
    console.error('Failed to fetch prayer request history', error);
    res.status(500).json({ error: 'Database error' });
  }
}

/** POST тело: { prayer_request: string, cycle_number?: number | null } — cycle_number как «Цикл N» в интерфейсе (1 = первый цикл). */
export async function addPrayerRequestHistoryHandler(req: Request, res: Response): Promise<void> {
  const authReq = ensureAdmin(req, res);
  if (!authReq) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (typeof body.prayer_request !== 'string') {
    res.status(400).json({ error: 'Ожидается prayer_request (строка)' });
    return;
  }

  let cycleIndex: number | null = null;
  if (body.cycle_number !== undefined && body.cycle_number !== null && body.cycle_number !== '') {
    const n = Number(body.cycle_number);
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
      res.status(400).json({ error: 'cycle_number должен быть целым числом ≥ 1' });
      return;
    }
    cycleIndex = n - 1;
  }

  try {
    const row = await addPrayerRequestHistoryManual(userId, body.prayer_request, cycleIndex);
    notifyRealtime(['members']);
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'empty_prayer_request') {
      res.status(400).json({ error: 'Текст нужды не может быть пустым' });
      return;
    }
    console.error('Failed to add prayer request history', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const { first_name, last_name, phone_number, birth_date } = req.body as {
    first_name?: unknown;
    last_name?: unknown;
    phone_number?: unknown;
    birth_date?: unknown;
  };

  if (typeof first_name !== 'string' || first_name.trim().length === 0) {
    res.status(400).json({ error: 'Field "first_name" is required' });
    return;
  }

  if (typeof last_name !== 'string' || last_name.trim().length === 0) {
    res.status(400).json({ error: 'Field "last_name" is required' });
    return;
  }

  if (!isValidPhoneInput(phone_number)) {
    res.status(400).json({ error: 'Field "phone_number" is required and must be valid' });
    return;
  }

  const birthYmd =
    typeof birth_date === 'string' && birth_date.trim().length > 0
      ? coerceToYmd(birth_date as string)
      : null;
  if (!birthYmd) {
    res.status(400).json({ error: 'Field "birth_date" is required and must be YYYY-MM-DD' });
    return;
  }

  if (!isValidOptionalShortString(req.body.ministry_role)) {
    res.status(400).json({ error: 'Field "ministry_role" must be a short string' });
    return;
  }

  if (!isValidOptionalShortString(req.body.ministry_direction)) {
  if (!isValidOptionalShortString(req.body.telegram_chat_id, 64)) {
    res.status(400).json({ error: 'Field "telegram_chat_id" must be a short string' });
    return;
  }

    res.status(400).json({ error: 'Field "ministry_direction" must be a short string' });
    return;
  }

  if (req.body.app_role !== undefined && !isValidAppRole(req.body.app_role)) {
    res.status(400).json({
      error:
        'Field "app_role" must be "parishioner", "member", "minister", "pastor", "musician", "editor", or "admin"',
    });
    return;
  }
  if (req.body.merge_if_duplicate !== undefined && typeof req.body.merge_if_duplicate !== 'boolean') {
    res.status(400).json({ error: 'Field "merge_if_duplicate" must be boolean' });
    return;
  }

  try {
    const user = await createUser({
      ...req.body,
      first_name: (first_name as string).trim(),
      last_name: (last_name as string).trim(),
      phone_number: (phone_number as string).trim(),
      birth_date: birthYmd,
      telegram_chat_id:
        typeof req.body.telegram_chat_id === 'string' ? req.body.telegram_chat_id.trim() : undefined,
    });
    notifyRealtime(['members', 'calendar']);
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof MemberNameDuplicateError) {
      res.status(409).json({ error: error.message, code: 'member_name_duplicate' });
      return;
    }
    console.error('Failed to create user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

const BULK_CREATE_MAX = 150;

export async function bulkCreateUsersHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }

  const raw = req.body as { members?: unknown; merge_if_duplicate?: unknown };
  if (!Array.isArray(raw.members) || raw.members.length === 0) {
    res.status(400).json({ error: 'Ожидается непустой массив "members"' });
    return;
  }
  if (raw.members.length > BULK_CREATE_MAX) {
    res.status(400).json({ error: `Не больше ${BULK_CREATE_MAX} строк за один запрос` });
    return;
  }
  if (raw.merge_if_duplicate !== undefined && typeof raw.merge_if_duplicate !== 'boolean') {
    res.status(400).json({ error: 'Поле "merge_if_duplicate" должно быть boolean' });
    return;
  }
  const mergeIfDuplicate = raw.merge_if_duplicate === true;

  type RowPayload = {
    first_name: string;
    last_name: string;
    phone_number: string;
    birth_date: string;
    ministry_role?: string;
    ministry_direction?: string;
    merge_if_duplicate?: boolean;
  };

  const payloads: RowPayload[] = [];
  const validationErrors: { index: number; message: string }[] = [];

  for (let i = 0; i < raw.members.length; i++) {
    const row = raw.members[i];
    if (!row || typeof row !== 'object') {
      validationErrors.push({ index: i, message: 'Строка должна быть объектом с полями' });
      continue;
    }
    const o = row as Record<string, unknown>;
    const first_name = o.first_name;
    const last_name = o.last_name;
    const phone_number = o.phone_number;
    const birth_date = o.birth_date;

    if (typeof first_name !== 'string' || first_name.trim().length === 0) {
      validationErrors.push({ index: i, message: 'Нужно поле "first_name" (имя)' });
      continue;
    }
    if (typeof last_name !== 'string' || last_name.trim().length === 0) {
      validationErrors.push({ index: i, message: 'Нужно поле "last_name" (фамилия)' });
      continue;
    }
    if (!isValidPhoneInput(phone_number)) {
      validationErrors.push({ index: i, message: 'Поле "phone_number": укажите корректный телефон (7–20 символов, цифры и +-() )' });
      continue;
    }
    const birthYmd =
      typeof birth_date === 'string' && birth_date.trim().length > 0
        ? coerceToYmd(birth_date as string)
        : null;
    if (!birthYmd) {
      validationErrors.push({
        index: i,
        message: 'Поле "birth_date": нужна дата в формате ГГГГ-ММ-ДД',
      });
      continue;
    }
    if (!isValidOptionalShortString(o.ministry_role)) {
      validationErrors.push({ index: i, message: 'Поле "ministry_role" — строка не длиннее 120 символов' });
      continue;
    }
    if (!isValidOptionalShortString(o.ministry_direction)) {
      validationErrors.push({
        index: i,
        message: 'Поле "ministry_direction" — строка не длиннее 120 символов',
      });
      continue;
    }

    const ministryRole =
      typeof o.ministry_role === 'string' && o.ministry_role.trim() ? o.ministry_role.trim() : undefined;
    const ministryDirection =
      typeof o.ministry_direction === 'string' && o.ministry_direction.trim()
        ? o.ministry_direction.trim()
        : undefined;

    payloads.push({
      first_name: (first_name as string).trim(),
      last_name: (last_name as string).trim(),
      phone_number: (phone_number as string).trim(),
      birth_date: birthYmd,
      ...(ministryRole ? { ministry_role: ministryRole } : {}),
      ...(ministryDirection ? { ministry_direction: ministryDirection } : {}),
      ...(mergeIfDuplicate ? { merge_if_duplicate: true } : {}),
    });
  }

  if (validationErrors.length > 0) {
    res.status(400).json({
      error: 'Ошибки в данных строк',
      validation_errors: validationErrors,
    });
    return;
  }

  try {
    const { users, errors } = await bulkCreateUsers(payloads);
    if (users.length > 0) {
      notifyRealtime(['members', 'calendar']);
    }
    res.status(201).json({
      created: users.length,
      users,
      errors,
      ok: errors.length === 0,
    });
  } catch (error) {
    console.error('Failed bulk create users', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  if (req.body.swap_first_and_last_name !== undefined) {
    if (typeof req.body.swap_first_and_last_name !== 'boolean') {
      res.status(400).json({ error: 'Field "swap_first_and_last_name" must be boolean' });
      return;
    }
    if (req.body.swap_first_and_last_name === true) {
      const extraKeys = Object.keys(req.body).filter(
        (k) => k !== 'swap_first_and_last_name' && req.body[k] !== undefined
      );
      if (extraKeys.length > 0) {
        res.status(400).json({
          error:
            'Для смены местами имя/фамилия отправьте только { "swap_first_and_last_name": true }',
        });
        return;
      }
      try {
        const updated = await swapMemberFirstLastName(userId);
        if (!updated) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        notifyRealtime(['members', 'calendar']);
        res.json(updated);
      } catch (error) {
        if (error instanceof MemberNameDuplicateError) {
          res.status(409).json({ error: error.message, code: 'member_name_duplicate' });
          return;
        }
        console.error('Failed to swap member name fields', error);
        res.status(500).json({ error: 'Database error' });
      }
      return;
    }
  }

  if (req.body.birth_date !== undefined) {
    const bdRaw = req.body.birth_date;
    if (bdRaw === null) {
      req.body.birth_date = '';
    } else if (typeof bdRaw === 'string') {
      const bd = bdRaw.trim();
      if (bd.length === 0) {
        req.body.birth_date = '';
      } else {
        const ymd = coerceToYmd(bdRaw);
        if (!ymd) {
          res.status(400).json({ error: 'Field "birth_date" must be YYYY-MM-DD or empty' });
          return;
        }
        req.body.birth_date = ymd;
      }
    } else {
      res.status(400).json({ error: 'Field "birth_date" must be YYYY-MM-DD or empty' });
      return;
    }
  }

  if (req.body.phone_number !== undefined) {
    const phRaw = req.body.phone_number;
    const ph = typeof phRaw === 'string' ? phRaw.trim() : '';
    if (ph.length > 0 && !isValidPhoneInput(phRaw)) {
      res.status(400).json({ error: 'Field "phone_number" must be valid' });
      return;
    }
  }

  if (req.body.first_name !== undefined || req.body.last_name !== undefined) {
    if (
      typeof req.body.first_name !== 'string' ||
      req.body.first_name.trim().length === 0 ||
      typeof req.body.last_name !== 'string' ||
      req.body.last_name.trim().length === 0
    ) {
      res
        .status(400)
        .json({ error: 'Fields "first_name" and "last_name" must be provided together' });
      return;
    }
  }

  if (!isValidOptionalShortString(req.body.ministry_role)) {
    res.status(400).json({ error: 'Field "ministry_role" must be a short string' });
    return;
  }

  if (!isValidOptionalShortString(req.body.ministry_direction)) {
    res.status(400).json({ error: 'Field "ministry_direction" must be a short string' });
    return;
  }

  if (!isValidOptionalShortString(req.body.telegram_chat_id, 64)) {
    res.status(400).json({ error: 'Field "telegram_chat_id" must be a short string' });
    return;
  }

  if (req.body.app_role !== undefined && !isValidAppRole(req.body.app_role)) {
    res.status(400).json({
      error:
        'Field "app_role" must be "parishioner", "member", "minister", "pastor", "musician", "editor", or "admin"',
    });
    return;
  }

  if (
    req.body.is_collection_coordinator !== undefined &&
    typeof req.body.is_collection_coordinator !== 'boolean'
  ) {
    res.status(400).json({ error: 'Field "is_collection_coordinator" must be boolean' });
    return;
  }

  if (req.body.in_prayer_cycle !== undefined && typeof req.body.in_prayer_cycle !== 'boolean') {
    res.status(400).json({ error: 'Field "in_prayer_cycle" must be boolean' });
    return;
  }

  try {
    const updated = await updateUser(userId, req.body);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const rt: RealtimeScope[] = ['members', 'calendar'];
    if (req.body.is_collection_coordinator !== undefined || req.body.app_role !== undefined) {
      rt.push('me');
    }
    notifyRealtime(rt);
    res.json(updated);
  } catch (error) {
    if (error instanceof MemberNameDuplicateError) {
      res.status(409).json({ error: error.message, code: 'member_name_duplicate' });
      return;
    }
    console.error('Failed to update user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteUserHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const deleted = await deleteUser(userId);
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    notifyRealtime(['members', 'calendar']);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function adminResetUserPasswordHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  try {
    const updated = await adminForceResetMemberPassword(userId);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    notifyRealtime(['members', 'me']);
    res.json(updated);
  } catch (error) {
    console.error('Failed to reset member password by admin', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function linkUserAccountHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const accountProvider =
    typeof req.body.account_provider === 'string' ? req.body.account_provider.trim() : '';
  const accountId = typeof req.body.account_id === 'string' ? req.body.account_id.trim() : '';

  if (!accountProvider || !accountId) {
    res.status(400).json({ error: 'Fields "account_provider" and "account_id" are required' });
    return;
  }

  try {
    const user = await linkUserAccount(userId, {
      account_provider: accountProvider,
      account_id: accountId,
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    notifyRealtime(['members']);
    res.json(user);
  } catch (error) {
    console.error('Failed to link account', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function setUserAppRoleHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const appRolesRaw = (req.body as { app_roles?: unknown }).app_roles;
  const appRoleSingle = req.body.app_role;
  const parsedRoles: AppRole[] = [];
  if (Array.isArray(appRolesRaw)) {
    for (const role of appRolesRaw) {
      if (!isValidAppRole(role)) {
        res.status(400).json({
          error:
            'Field "app_roles" must contain only "parishioner", "member", "minister", "pastor", "musician", "editor", or "admin"',
        });
        return;
      }
      if (!parsedRoles.includes(role)) parsedRoles.push(role);
    }
  }
  if (isValidAppRole(appRoleSingle) && !parsedRoles.includes(appRoleSingle)) {
    parsedRoles.push(appRoleSingle);
  }
  if (parsedRoles.length === 0) {
    res.status(400).json({
      error:
        'Передайте "app_role" или непустой массив "app_roles" со значениями "parishioner", "member", "minister", "pastor", "musician", "editor", "admin"',
    });
    return;
  }

  try {
    const updated = await setUserAppRoles(userId, parsedRoles);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    notifyRealtime(['members', 'me']);
    res.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Cannot remove the last active administrator') {
      res.status(409).json({ error: 'At least one active administrator is required' });
      return;
    }
    console.error('Failed to update app role', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function startPrayerCycleHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const startDateRaw = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : '';
  const startYmd = coerceToYmd(startDateRaw);
  if (!startYmd) {
    res.status(400).json({ error: 'Field "start_date" is required and must be YYYY-MM-DD' });
    return;
  }

  try {
    const result = await startPrayerCycle(startYmd);
    notifyRealtime(['calendar', 'members', 'me']);
    res.json(result);
  } catch (error) {
    console.error('Failed to start prayer cycle', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getPrayerCycleRosterHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const dateRaw = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const anchorYmd = dateRaw ? coerceToYmd(dateRaw) : new Date().toISOString().slice(0, 10);
  if (dateRaw && !anchorYmd) {
    res.status(400).json({ error: 'Query "date" must be YYYY-MM-DD' });
    return;
  }

  try {
    const snapshot = await getPrayerCycleRosterSnapshot(anchorYmd!);
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to load prayer cycle roster', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function anchorPrayerCycleMemberHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const rawId = (req.body as { member_id?: unknown }).member_id;
  const memberId = typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? Number(rawId) : NaN;
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(400).json({ error: 'Field "member_id" is required (positive integer)' });
    return;
  }
  const dateRaw = typeof req.body.anchor_date === 'string' ? req.body.anchor_date.trim() : '';
  const anchorYmd = coerceToYmd(dateRaw);
  if (!anchorYmd) {
    res.status(400).json({ error: 'Field "anchor_date" is required (YYYY-MM-DD)' });
    return;
  }

  try {
    const result = await anchorPrayerCycleMemberOnDate(memberId, anchorYmd);
    notifyRealtime(['calendar', 'members', 'me', 'coordinator-notes']);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Member not in active prayer cycle') {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === 'Invalid start date') {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to anchor prayer cycle member', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function savePrayerCycleRosterOrderHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const body = req.body as { anchor_date?: unknown; ordered_member_ids?: unknown };
  const dateRaw = typeof body.anchor_date === 'string' ? body.anchor_date.trim() : '';
  const anchorYmd = coerceToYmd(dateRaw);
  if (!anchorYmd) {
    res.status(400).json({ error: 'Field "anchor_date" is required (YYYY-MM-DD)' });
    return;
  }
  const rawIds = body.ordered_member_ids;
  if (!Array.isArray(rawIds)) {
    res.status(400).json({ error: 'Field "ordered_member_ids" must be an array of member ids' });
    return;
  }
  const orderedMemberIds: number[] = [];
  for (const x of rawIds) {
    const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN;
    if (!Number.isInteger(n) || n <= 0) {
      res.status(400).json({ error: 'Each entry in "ordered_member_ids" must be a positive integer' });
      return;
    }
    orderedMemberIds.push(n);
  }

  try {
    const result = await savePrayerCycleRosterCustomOrderForAnchorDate(anchorYmd, orderedMemberIds);
    notifyRealtime(['calendar', 'members', 'me', 'coordinator-notes']);
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Roster size mismatch') {
        res.status(400).json({ error: 'Состав очереди изменился — обновите страницу и попробуйте снова.' });
        return;
      }
      if (error.message === 'Invalid roster member') {
        res.status(400).json({ error: 'В порядке есть участник вне текущего цикла.' });
        return;
      }
      if (error.message === 'Duplicate roster member') {
        res.status(400).json({ error: 'В порядке указан один и тот же участник дважды.' });
        return;
      }
      if (error.message === 'Empty prayer cycle roster') {
        res.status(400).json({ error: 'Очередь цикла пуста.' });
        return;
      }
    }
    console.error('Failed to save prayer cycle roster order', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function setOneTimeMemberDateOverrideHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const targetDate = typeof req.body.target_date === 'string' ? req.body.target_date.trim() : '';
  const targetYmd = coerceToYmd(targetDate);
  if (!targetYmd) {
    res.status(400).json({ error: 'Field "target_date" is required and must be YYYY-MM-DD' });
    return;
  }

  try {
    const result = await setOneTimeMemberDateOverride(userId, targetYmd);
    notifyRealtime(['calendar']);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    console.error('Failed to set one-time member override', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getMinistryRoleTemplatesHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAuthenticated(req, res)) {
    return;
  }
  try {
    const templates = await listMinistryRoleTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Failed to fetch ministry role templates', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function createMinistryRoleTemplateHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'Field "title" is required' });
    return;
  }
  if (title.length > 120) {
    res.status(400).json({ error: 'Field "title" must be up to 120 characters' });
    return;
  }

  try {
    const created = await createMinistryRoleTemplate(title);
    notifyRealtime(['templates']);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      res.status(409).json({ error: 'Template already exists' });
      return;
    }
    console.error('Failed to create ministry role template', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteMinistryRoleTemplateHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const templateId = parseUserId(req.params.id);
  if (!templateId) {
    res.status(400).json({ error: 'Invalid template id' });
    return;
  }

  try {
    const deleted = await deleteMinistryRoleTemplate(templateId);
    if (!deleted) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    notifyRealtime(['templates']);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete ministry role template', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getMinistryDirectionTemplatesHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAuthenticated(req, res)) {
    return;
  }
  try {
    const templates = await listMinistryDirectionTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Failed to fetch ministry direction templates', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function createMinistryDirectionTemplateHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'Field "title" is required' });
    return;
  }
  if (title.length > 120) {
    res.status(400).json({ error: 'Field "title" must be up to 120 characters' });
    return;
  }

  try {
    const created = await createMinistryDirectionTemplate(title);
    notifyRealtime(['templates']);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      res.status(409).json({ error: 'Template already exists' });
      return;
    }
    console.error('Failed to create ministry direction template', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteMinistryDirectionTemplateHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const templateId = parseUserId(req.params.id);
  if (!templateId) {
    res.status(400).json({ error: 'Invalid template id' });
    return;
  }

  try {
    const deleted = await deleteMinistryDirectionTemplate(templateId);
    if (!deleted) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    notifyRealtime(['templates']);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete ministry direction template', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function setMinistryDirectionTemplateRolesHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!ensureAdmin(req, res)) {
    return;
  }
  const templateId = parseUserId(req.params.id);
  if (!templateId) {
    res.status(400).json({ error: 'Invalid template id' });
    return;
  }
  const roleIdsRaw = (req.body as { role_ids?: unknown } | undefined)?.role_ids;
  if (!Array.isArray(roleIdsRaw)) {
    res.status(400).json({ error: 'Field "role_ids" must be an array of ids' });
    return;
  }
  const roleIds = roleIdsRaw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);

  try {
    const updated = await setMinistryDirectionTemplateRoles(templateId, roleIds);
    if (!updated) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    notifyRealtime(['templates']);
    res.json(updated);
  } catch (error) {
    console.error('Failed to set ministry direction roles', error);
    res.status(500).json({ error: 'Database error' });
  }
}
