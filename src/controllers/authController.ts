import { Request, Response } from 'express';
import {
  approveAccessRequest,
  getAuthUserById,
  listAccessRequests,
  loginUser,
  logoutByToken,
  rejectAccessRequest,
  registerUser,
} from '../services/authService';

type AuthRequest = Request & {
  authUserId?: number;
  authUserRole?: 'member' | 'admin';
  authToken?: string;
};

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
      res.status(202).json(registration);
      return;
    }

    res.status(201).json(registration);
  } catch (error) {
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

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const token = authReq.authToken;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    await logoutByToken(token);
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
    res.json({ status: 'rejected' });
  } catch (error) {
    console.error('Failed to reject access request', error);
    res.status(500).json({ error: 'Database error' });
  }
}
