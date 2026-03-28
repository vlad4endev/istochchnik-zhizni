import { Request, Response } from 'express';
import {
  AppRole,
  createMinistryDirectionTemplate,
  createMinistryRoleTemplate,
  createUser,
  deleteMinistryDirectionTemplate,
  deleteMinistryRoleTemplate,
  deleteUser,
  getUserById,
  linkUserAccount,
  listMinistryDirectionTemplates,
  listPrayerRequestHistory,
  listMinistryRoleTemplates,
  listUsers,
  setOneTimeMemberDateOverride,
  setUserAppRole,
  startPrayerCycle,
  updateUser,
} from '../services/userService';

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
  return value === 'member' || value === 'admin';
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (error) {
    console.error('Failed to fetch users', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
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
  const authReq = req as Request & { authUserId?: number; authUserRole?: string };
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
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

export async function createUserHandler(req: Request, res: Response): Promise<void> {
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

  if (!isValidDateInput(birth_date)) {
    res.status(400).json({ error: 'Field "birth_date" is required and must be YYYY-MM-DD' });
    return;
  }

  if (!isValidOptionalShortString(req.body.ministry_role)) {
    res.status(400).json({ error: 'Field "ministry_role" must be a short string' });
    return;
  }

  if (!isValidOptionalShortString(req.body.ministry_direction)) {
    res.status(400).json({ error: 'Field "ministry_direction" must be a short string' });
    return;
  }

  if (req.body.app_role !== undefined && !isValidAppRole(req.body.app_role)) {
    res.status(400).json({ error: 'Field "app_role" must be "member" or "admin"' });
    return;
  }

  try {
    const user = await createUser({
      ...req.body,
      first_name: (first_name as string).trim(),
      last_name: (last_name as string).trim(),
      phone_number: (phone_number as string).trim(),
      birth_date: (birth_date as string).trim(),
    });
    res.status(201).json(user);
  } catch (error) {
    console.error('Failed to create user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  if (req.body.birth_date !== undefined && !isValidDateInput(req.body.birth_date)) {
    res.status(400).json({ error: 'Field "birth_date" must be YYYY-MM-DD' });
    return;
  }

  if (req.body.phone_number !== undefined && !isValidPhoneInput(req.body.phone_number)) {
    res.status(400).json({ error: 'Field "phone_number" must be valid' });
    return;
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

  if (req.body.app_role !== undefined && !isValidAppRole(req.body.app_role)) {
    res.status(400).json({ error: 'Field "app_role" must be "member" or "admin"' });
    return;
  }

  if (
    req.body.is_collection_coordinator !== undefined &&
    typeof req.body.is_collection_coordinator !== 'boolean'
  ) {
    res.status(400).json({ error: 'Field "is_collection_coordinator" must be boolean' });
    return;
  }

  try {
    const updated = await updateUser(userId, req.body);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    console.error('Failed to update user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteUserHandler(req: Request, res: Response): Promise<void> {
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
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete user', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function linkUserAccountHandler(req: Request, res: Response): Promise<void> {
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
    res.json(user);
  } catch (error) {
    console.error('Failed to link account', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function setUserAppRoleHandler(req: Request, res: Response): Promise<void> {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const appRole = req.body.app_role;
  if (!isValidAppRole(appRole)) {
    res.status(400).json({ error: 'Field "app_role" must be "member" or "admin"' });
    return;
  }

  try {
    const updated = await setUserAppRole(userId, appRole);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
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
  const startDateRaw = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : '';

  if (!isValidDateInput(startDateRaw)) {
    res.status(400).json({ error: 'Field "start_date" is required and must be YYYY-MM-DD' });
    return;
  }

  try {
    const result = await startPrayerCycle(startDateRaw);
    res.json(result);
  } catch (error) {
    console.error('Failed to start prayer cycle', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function setOneTimeMemberDateOverrideHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = parseUserId(req.params.id);
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const targetDate = typeof req.body.target_date === 'string' ? req.body.target_date.trim() : '';
  if (!isValidDateInput(targetDate)) {
    res.status(400).json({ error: 'Field "target_date" is required and must be YYYY-MM-DD' });
    return;
  }

  try {
    const result = await setOneTimeMemberDateOverride(userId, targetDate);
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
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete ministry direction template', error);
    res.status(500).json({ error: 'Database error' });
  }
}
