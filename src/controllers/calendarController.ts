import { Request, Response } from 'express';
import { getNextWeekMemberAssignments, getPrayerDataByDate } from '../services/calendarService';

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

export async function getNextWeekMembers(req: Request, res: Response): Promise<void> {
  try {
    const days = await getNextWeekMemberAssignments();
    res.json({ days });
  } catch (err) {
    console.error('Calendar next-week error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}
