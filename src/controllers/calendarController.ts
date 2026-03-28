import { Request, Response } from 'express';
import { query } from '../config/db';
import { getNextWeekMemberAssignments, getPrayerDataByDate } from '../services/calendarService';
import {
  getNextWeekCollectionSnapshot,
  upsertCoordinatorPicks,
} from '../services/collectionPicksService';

function isValidDateInput(value: unknown): value is string {
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

export async function getPrayerData(req: Request, res: Response): Promise<void> {
  try {
    const { date } = req.params;
    if (!isValidDateInput(date)) {
      res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
      return;
    }

    const data = await getPrayerDataByDate(date);
    res.json(data);
  } catch (err) {
    console.error('Calendar controller error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

function formatBotPrayerMessage(date: string, data: Awaited<ReturnType<typeof getPrayerDataByDate>>): string {
  const dayText = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

  const member = data.members[0];
  const theme = data.global_themes[0];
  const ministry = data.ministries[0];
  const backslider = data.backsliders[0];

  const memberName = member?.name ?? 'Не назначен';
  const memberPrayer = (member?.prayer_request ?? 'Нужда не указана').trim();

  const themeTitle = theme?.title?.trim() ? theme.title.trim().toUpperCase() : 'ТЕМА НЕ УКАЗАНА';
  const verse = (theme?.bible_verse ?? 'Стих не указан').trim();
  const themePrayerPoints = (theme?.prayer_points ?? 'Пункты молитвы не указаны').trim();

  const ministryText = (ministry?.prayer_points ?? ministry?.title ?? 'Служение не указано').trim();
  const backsliderName = (backslider?.name ?? 'Не указан').trim();

  return [
    `Сегодня ${dayText} мы молимся за члена церкви:`,
    '',
    `📌 ${memberName}`,
    'просит молиться:',
    memberPrayer,
    '',
    `- ${themeTitle}`,
    `📖 ${verse}`,
    '🙏',
    themePrayerPoints,
    '',
    `🛠️ ${ministryText}`,
    '',
    `📍Молитва за отпавших: ${backsliderName}`,
  ].join('\n');
}

export async function getPrayerBotMessage(req: Request, res: Response): Promise<void> {
  try {
    const { date } = req.params;
    if (!isValidDateInput(date)) {
      res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
      return;
    }

    const data = await getPrayerDataByDate(date);
    const message = formatBotPrayerMessage(date, data);
    res.json({ date, message, data });
  } catch (err) {
    console.error('Calendar bot-message error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getTodayPrayerBotMessage(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);

  try {
    const data = await getPrayerDataByDate(today);
    const message = formatBotPrayerMessage(today, data);
    res.json({ date: today, message, data });
  } catch (err) {
    console.error('Calendar today bot-message error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

type AuthReq = Request & { authUserId?: number; authUserRole?: 'member' | 'admin' };

/** План «молитва за члена» на следующую неделю — только админы и ответственные за сбор. */
async function assertCanViewNextWeekMembersPlan(req: Request, res: Response): Promise<boolean> {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }
  if (authReq.authUserRole === 'admin') {
    return true;
  }

  try {
    const result = await query(
      'SELECT is_collection_coordinator FROM members WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [authReq.authUserId]
    );
    const row = result.rows[0] as { is_collection_coordinator?: boolean } | undefined;
    if (row?.is_collection_coordinator === true) {
      return true;
    }
  } catch (err) {
    console.error('Calendar next-week members access check failed:', err);
    res.status(500).json({ error: 'Database error' });
    return false;
  }

  res.status(403).json({ error: 'Нет доступа к плану на следующую неделю' });
  return false;
}

export async function getNextWeekMembers(req: Request, res: Response): Promise<void> {
  if (!(await assertCanViewNextWeekMembersPlan(req, res))) {
    return;
  }
  try {
    const days = await getNextWeekMemberAssignments();
    res.json({ days });
  } catch (err) {
    console.error('Calendar next-week error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getNextWeekCollection(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthReq;
    const snapshot = await getNextWeekCollectionSnapshot(authReq.authUserId ?? null);
    res.json(snapshot);
  } catch (err) {
    console.error('Calendar next-week collection GET error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

function isValidYmdMap(value: unknown): value is Record<string, number | null> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  for (const v of Object.values(o)) {
    if (v !== null && typeof v !== 'number') {
      return false;
    }
    if (typeof v === 'number' && (!Number.isInteger(v) || v <= 0)) {
      return false;
    }
  }
  return true;
}

export async function patchNextWeekCollection(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return;
  }

  const picksRaw = req.body?.picks;
  if (!isValidYmdMap(picksRaw)) {
    res.status(400).json({ error: 'Ожидается объект picks: { \"YYYY-MM-DD\": member_id | null }' });
    return;
  }

  try {
    await upsertCoordinatorPicks(authReq.authUserId, picksRaw);
    const snapshot = await getNextWeekCollectionSnapshot(authReq.authUserId);
    res.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'not_coordinator') {
      res.status(403).json({ error: 'Только ответственные за сбор могут редактировать свой список' });
      return;
    }
    if (msg === 'invalid_date' || msg === 'invalid_member') {
      res.status(400).json({ error: 'Некорректные даты или участник' });
      return;
    }
    console.error('Calendar next-week collection PATCH error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}
