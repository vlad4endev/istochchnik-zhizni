import { Request, Response } from 'express';
import { appendClearAuthCookie, appendSetAuthCookie } from '../config/authCookie';
import {
  approveAccessRequest,
  changeMemberPhone,
  changeMemberPassword,
  getAuthUserById,
  listAccessRequests,
  loginUser,
  logoutByToken,
  rejectAccessRequest,
  registerUser,
  requestPasswordReset,
  updateAuthUserAvatar,
  updateAuthUserProfile,
} from '../services/authService';
import { notifyRealtime } from '../realtime/notify';
import { markAccessRequestMessengerResolved } from '../services/messengerService';
import { getCoordinatorMemberIdsWithPush } from '../services/fcmSubscriptionService';
import { sendPush } from '../services/pushService';
import { MemberNameDuplicateError } from '../services/userService';

type AuthRequest = Request & {
  authUserId?: number;
  authUserRole?: import('../types/appRole').AppRole;
  authToken?: string;
};

function attachSessionCookieIfPresent(res: Response, body: { token?: unknown }): void {
  const t = body.token;
  if (typeof t === 'string' && t.length > 0) {
    appendSetAuthCookie(res, t);
  }
}

const MIN_PASSWORD_LENGTH = 8;
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 20;

function readStringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isValidDateYmd(value: unknown): boolean {
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

function coerceBirthDateToYmd(value: string): string | null {
  const t = value.trim();
  if (t.length < 10) {
    return null;
  }
  const ymd = t.slice(0, 10);
  return isValidDateYmd(ymd) ? ymd : null;
}

function isValidPhoneForProfile(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  if (normalized.length < 7 || normalized.length > 20) {
    return false;
  }
  return /^[0-9+\-() ]+$/.test(normalized);
}

function isValidOptionalEmail(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const t = value.trim();
  if (t.length === 0) {
    return true;
  }
  return t.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
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

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D+/g, '');
}

function ensureCredentialsShape(phone: string, password: string): string | null {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) {
    return 'Field "phone_number" must contain 7-20 digits';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Field "password" must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const password = readStringField(req.body.password);
  const firstName = readStringField(req.body.first_name);
  const lastName = readStringField(req.body.last_name);
  const phoneNumber = readStringField(req.body.phone_number);

  const credentialsError = ensureCredentialsShape(phoneNumber, password);
  if (credentialsError) {
    res.status(400).json({ error: credentialsError });
    return;
  }

  if (!firstName || !lastName) {
    res.status(400).json({ error: 'Fields "first_name" and "last_name" are required' });
    return;
  }

  try {
    const registration = await registerUser({
      password,
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
    });

    if (registration.status === 'pending') {
      attachSessionCookieIfPresent(res, registration);
      res.status(202).json(registration);
      return;
    }

    notifyRealtime(['members', 'calendar']);
    attachSessionCookieIfPresent(res, registration);
    res.status(201).json(registration);
  } catch (error) {
    if (error instanceof MemberNameDuplicateError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === 'Account already exists') {
      res.status(409).json({ error: 'Аккаунт уже зарегистрирован для этого участника' });
      return;
    }
    if (error instanceof Error && error.message === 'Member identity mismatch') {
      res.status(409).json({
        error: 'Номер телефона и ФИО не совпадают с карточкой участника',
      });
      return;
    }
    if (error instanceof Error && error.message === 'Ambiguous phone number') {
      res.status(409).json({
        error: 'Найдено несколько участников с этим номером. Обратитесь к администратору.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'Invalid phone number') {
      res.status(400).json({ error: 'Неверный номер телефона' });
      return;
    }
    if (error instanceof Error && /^Invalid /.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to register user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const phoneNumber = readStringField(req.body.phone_number || req.body.login);
  const password = readStringField(req.body.password);

  const credentialsError = ensureCredentialsShape(phoneNumber, password);
  if (credentialsError) {
    res.status(400).json({ error: credentialsError });
    return;
  }

  try {
    const result = await loginUser(phoneNumber, password);
    if (!result) {
      res.status(401).json({ error: 'Неверный телефон или пароль' });
      return;
    }
    if (typeof result.token === 'string' && result.token.length > 0) {
      appendSetAuthCookie(res, result.token);
    }
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Ambiguous phone number') {
      res.status(409).json({
        error: 'Найдено несколько аккаунтов с этим номером. Обратитесь к администратору.',
      });
      return;
    }
    if (error instanceof Error && /^Invalid /.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to login user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function forgotPasswordRequestHandler(req: Request, res: Response): Promise<void> {
  const password = readStringField(req.body.password);
  const firstName = readStringField(req.body.first_name);
  const lastName = readStringField(req.body.last_name);
  const phoneNumber = readStringField(req.body.phone_number);

  const credentialsError = ensureCredentialsShape(phoneNumber, password);
  if (credentialsError) {
    res.status(400).json({ error: credentialsError });
    return;
  }

  if (!firstName || !lastName) {
    res.status(400).json({ error: 'Fields "first_name" and "last_name" are required' });
    return;
  }

  try {
    const result = await requestPasswordReset({
      password,
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
    });
    res.status(202).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid phone number') {
      res.status(400).json({ error: 'Неверный номер телефона' });
      return;
    }
    if (error instanceof Error && /^Invalid /.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to create password reset request', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await getAuthUserById(authReq.authUserId);
    if (!user) {
      res.status(401).json({ error: 'Session is no longer valid' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error('Failed to fetch current user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchProfileHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const hasFirst = body.first_name !== undefined;
  const hasLast = body.last_name !== undefined;
  if (hasFirst !== hasLast) {
    res.status(400).json({ error: 'Fields "first_name" and "last_name" must be sent together' });
    return;
  }
  if (hasFirst && hasLast) {
    if (typeof body.first_name !== 'string' || !body.first_name.trim()) {
      res.status(400).json({ error: 'Field "first_name" is required' });
      return;
    }
    if (typeof body.last_name !== 'string' || !body.last_name.trim()) {
      res.status(400).json({ error: 'Field "last_name" is required' });
      return;
    }
  }

  if (body.phone_number !== undefined && !isValidPhoneForProfile(body.phone_number)) {
    res.status(400).json({ error: 'Field "phone_number" must be valid' });
    return;
  }

  if (!isValidOptionalShortString(body.ministry_role)) {
    res.status(400).json({ error: 'Field "ministry_role" must be a short string' });
    return;
  }

  if (!isValidOptionalShortString(body.ministry_direction)) {
    res.status(400).json({ error: 'Field "ministry_direction" must be a short string' });
    return;
  }

  if (!isValidOptionalEmail(body.email)) {
    res.status(400).json({ error: 'Field "email" must be a valid address or empty' });
    return;
  }

  const MAX_PRAYER_REQUEST_CHARS = 8000;
  if (body.prayer_request !== undefined) {
    if (typeof body.prayer_request !== 'string') {
      res.status(400).json({ error: 'Field "prayer_request" must be a string' });
      return;
    }
    if (body.prayer_request.length > MAX_PRAYER_REQUEST_CHARS) {
      res.status(400).json({
        error: `Field "prayer_request" must be at most ${MAX_PRAYER_REQUEST_CHARS} characters`,
      });
      return;
    }
  }

  const patch: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    ministry_role?: string;
    ministry_direction?: string;
    birth_date?: string;
    email?: string;
    prayer_request?: string;
  } = {};

  if (hasFirst && hasLast) {
    patch.first_name = (body.first_name as string).trim();
    patch.last_name = (body.last_name as string).trim();
  }
  if (typeof body.phone_number === 'string') {
    patch.phone_number = body.phone_number.trim();
  }
  if (typeof body.ministry_role === 'string') {
    patch.ministry_role = body.ministry_role.trim();
  }
  if (typeof body.ministry_direction === 'string') {
    patch.ministry_direction = body.ministry_direction.trim();
  }
  if (body.birth_date !== undefined) {
    if (body.birth_date === null || (typeof body.birth_date === 'string' && !body.birth_date.trim())) {
      patch.birth_date = '';
    } else if (typeof body.birth_date === 'string') {
      const ymd = coerceBirthDateToYmd(body.birth_date);
      if (!ymd) {
        res.status(400).json({ error: 'Field "birth_date" must be YYYY-MM-DD or empty' });
        return;
      }
      patch.birth_date = ymd;
    } else {
      res.status(400).json({ error: 'Field "birth_date" must be YYYY-MM-DD or empty' });
      return;
    }
  }
  if (typeof body.email === 'string') {
    patch.email = body.email.trim();
  }
  if (typeof body.prayer_request === 'string') {
    patch.prayer_request = body.prayer_request;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  try {
    let previousPrayerTrimmed: string | null = null;
    if (typeof body.prayer_request === 'string') {
      const before = await getAuthUserById(authReq.authUserId);
      previousPrayerTrimmed = (before?.prayer_request ?? '').trim();
    }

    const user = await updateAuthUserProfile(authReq.authUserId, patch);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const rt: ('me' | 'calendar')[] = ['me'];
    if (typeof body.prayer_request === 'string') {
      rt.push('calendar');
    }
    notifyRealtime(rt);

    if (typeof body.prayer_request === 'string') {
      const nextPrayer = String(body.prayer_request).trim();
      if (nextPrayer !== (previousPrayerTrimmed ?? '')) {
        try {
          const coordIds = await getCoordinatorMemberIdsWithPush();
          const name = user.name?.trim() || 'Участник';
          for (const cid of coordIds) {
            if (cid === authReq.authUserId) continue;
            void sendPush(cid, 'Молитвенная нужда', `${name} обновил(а) свою молитвенную нужду.`, {
              url: '/calendar',
              type: 'prayer_member_update',
            });
          }
        } catch (pushErr) {
          console.warn('[auth] prayer coordinator push notify failed (best-effort):', pushErr);
        }
      }
    }

    res.json(user);
  } catch (error: unknown) {
    if (error instanceof MemberNameDuplicateError) {
      res.status(409).json({ error: error.message });
      return;
    }
    const pg = error as { code?: string };
    if (pg.code === '23505') {
      res.status(409).json({ error: 'Этот email уже используется' });
      return;
    }
    console.error('Failed to update profile', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function uploadAvatarHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: 'File is required' });
    return;
  }
  const avatarUrl = `/uploads/avatars/${file.filename}`;
  try {
    const user = await updateAuthUserAvatar(authReq.authUserId, avatarUrl);
    notifyRealtime(['me', 'members']);
    if (!user) {
      res.status(500).json({ error: 'Не удалось обновить профиль после загрузки' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error('Failed to upload avatar', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const currentPassword = readStringField(req.body.current_password);
  const newPassword = readStringField(req.body.new_password);
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Fields "current_password" and "new_password" are required' });
    return;
  }

  try {
    const result = await changeMemberPassword(authReq.authUserId, currentPassword, newPassword);
    if (result === 'ok') {
      res.status(204).send();
      return;
    }
    if (result === 'wrong_password') {
      res.status(401).json({ error: 'Неверный текущий пароль' });
      return;
    }
    if (result === 'no_password') {
      res.status(409).json({ error: 'Для аккаунта не задан пароль' });
      return;
    }
    res.status(400).json({ error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` });
  } catch (error) {
    console.error('Failed to change password', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function changePhoneHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const currentPassword = readStringField(req.body.current_password);
  const newPhoneNumber = readStringField(req.body.new_phone_number);
  if (!currentPassword || !newPhoneNumber) {
    res.status(400).json({ error: 'Fields "current_password" and "new_phone_number" are required' });
    return;
  }

  if (!isValidPhoneForProfile(newPhoneNumber)) {
    res.status(400).json({ error: 'Field "new_phone_number" must be valid' });
    return;
  }

  try {
    const result = await changeMemberPhone(authReq.authUserId, currentPassword, newPhoneNumber);
    if (result === 'ok') {
      notifyRealtime(['me', 'members']);
      res.status(204).send();
      return;
    }
    if (result === 'wrong_password') {
      res.status(401).json({ error: 'Неверный текущий пароль' });
      return;
    }
    if (result === 'no_password') {
      res.status(409).json({ error: 'Для аккаунта не задан пароль' });
      return;
    }
    if (result === 'phone_taken') {
      res.status(409).json({ error: 'Этот номер уже используется другим аккаунтом' });
      return;
    }
    res.status(400).json({ error: 'Неверный номер телефона' });
  } catch (error) {
    console.error('Failed to change phone number', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const token = authReq.authToken;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    await logoutByToken(token);
    appendClearAuthCookie(res);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to logout user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function listAccessRequestsHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (authReq.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Only admin can review access requests' });
    return;
  }

  const statusRaw = readStringField(req.query.status);
  const status =
    statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected'
      ? statusRaw
      : undefined;

  try {
    const items = await listAccessRequests(status);
    res.json(items);
  } catch (error) {
    console.error('Failed to list access requests', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function approveAccessRequestHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (authReq.authUserRole !== 'admin' || !authReq.authUserId) {
    res.status(403).json({ error: 'Only admin can approve requests' });
    return;
  }

  const requestId = parseId(req.params.id);
  if (!requestId) {
    res.status(400).json({ error: 'Invalid request id' });
    return;
  }

  const reviewNote = readStringField(req.body.review_note);

  try {
    const user = await approveAccessRequest(requestId, authReq.authUserId, reviewNote || undefined);
    if (!user) {
      res.status(404).json({ error: 'Pending request not found' });
      return;
    }
    notifyRealtime(['members', 'calendar']);
    void markAccessRequestMessengerResolved(requestId, 'approved').catch((e) =>
      console.warn('[auth] markAccessRequestMessengerResolved(approved):', e),
    );
    res.json({ status: 'approved', user });
  } catch (error) {
    console.error('Failed to approve access request', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function rejectAccessRequestHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  if (authReq.authUserRole !== 'admin' || !authReq.authUserId) {
    res.status(403).json({ error: 'Only admin can reject requests' });
    return;
  }

  const requestId = parseId(req.params.id);
  if (!requestId) {
    res.status(400).json({ error: 'Invalid request id' });
    return;
  }

  const reviewNote = readStringField(req.body.review_note);
  try {
    const ok = await rejectAccessRequest(requestId, authReq.authUserId, reviewNote || undefined);
    if (!ok) {
      res.status(404).json({ error: 'Pending request not found' });
      return;
    }
    notifyRealtime(['members']);
    void markAccessRequestMessengerResolved(requestId, 'rejected').catch((e) =>
      console.warn('[auth] markAccessRequestMessengerResolved(rejected):', e),
    );
    res.json({ status: 'rejected' });
  } catch (error) {
    console.error('Failed to reject access request', error);
    res.status(500).json({ error: 'Database error' });
  }
}
