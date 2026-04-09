import { Request, Response } from 'express';
import { query } from '../config/db';
import {
  getMemberAssignmentsForWeek,
  type WeekPlanKind,
  getPrayerDataByDate,
} from '../services/calendarService';
import { setCoordinatorPrayerNeedForDate } from '../services/userService';
import {
  getCycleCollectionClaimsSnapshot,
  setCycleCollectionClaim,
} from '../services/cycleCollectionClaimsService';
import { notifyRealtime } from '../realtime/notify';
import { sendPush } from '../services/pushService';

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

type BirthdayWeekRow = {
  id: number;
  name: string;
  birth_date: string;
  week_date: string;
};

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fullNameOrFallback(row: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}): string {
  const fn = (row.first_name ?? '').trim();
  const ln = (row.last_name ?? '').trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return (row.name ?? '').trim() || 'Участник';
}

function birthdayForYear(birthDateYmd: string, year: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateYmd);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export async function getWeekBirthdays(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const years = Array.from(new Set([weekStart.getFullYear(), weekEnd.getFullYear()]));
    const result = await query(
      `SELECT id, first_name, last_name, name, birth_date::text AS birth_date
       FROM members
       WHERE is_active = TRUE
         AND birth_date IS NOT NULL`,
    );

    const out: BirthdayWeekRow[] = [];
    for (const rowRaw of result.rows) {
      const row = rowRaw as {
        id?: unknown;
        first_name?: string | null;
        last_name?: string | null;
        name?: string | null;
        birth_date?: unknown;
      };
      if (typeof row.id !== 'number') continue;
      if (typeof row.birth_date !== 'string') continue;
      const personName = fullNameOrFallback(row);

      let hit: Date | null = null;
      for (const y of years) {
        const b = birthdayForYear(row.birth_date, y);
        if (!b) continue;
        if (b.getTime() >= weekStart.getTime() && b.getTime() <= weekEnd.getTime()) {
          hit = b;
          break;
        }
      }
      if (!hit) continue;

      out.push({
        id: row.id,
        name: personName,
        birth_date: row.birth_date,
        week_date: formatYmdLocal(hit),
      });
    }

    out.sort((a, b) => {
      const byDate = a.week_date.localeCompare(b.week_date);
      if (byDate !== 0) return byDate;
      return a.name.localeCompare(b.name, 'ru');
    });

    res.json({
      week_start: formatYmdLocal(weekStart),
      week_end: formatYmdLocal(weekEnd),
      items: out,
    });
  } catch (err) {
    console.error('Calendar birthdays-week error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

type AuthReq = Request & { authUserId?: number; authUserRole?: 'member' | 'admin' };

/** План на след. неделю и назначения сбора — только администраторы и ответственные за сбор. */
async function assertAdminOrCollectionCoordinator(req: Request, res: Response): Promise<boolean> {
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

  res.status(403).json({ error: 'Нет доступа к разделу следующей недели' });
  return false;
}

function parseWeekPlanKind(value: unknown): WeekPlanKind {
  return value === 'current' ? 'current' : 'next';
}

function parseOptionalWeekKind(value: unknown): WeekPlanKind | undefined {
  if (value === 'current' || value === 'next') {
    return value;
  }
  return undefined;
}

export async function getNextWeekMembers(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminOrCollectionCoordinator(req, res))) {
    return;
  }
  try {
    const kind = parseWeekPlanKind(req.query?.week);
    const days = await getMemberAssignmentsForWeek(kind);
    res.json({ days, week: kind });
  } catch (err) {
    console.error('Calendar next-week error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchMemberCyclePrayer(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminOrCollectionCoordinator(req, res))) {
    return;
  }

  const memberId = parsePositiveInt(req.body?.member_id);
  const targetDate = req.body?.target_date;
  const prayerRaw = req.body?.prayer_request;

  if (memberId == null || typeof targetDate !== 'string' || !isValidDateInput(targetDate)) {
    res.status(400).json({ error: 'Ожидается member_id и target_date (YYYY-MM-DD)' });
    return;
  }
  if (typeof prayerRaw !== 'string') {
    res.status(400).json({ error: 'Ожидается prayer_request (строка)' });
    return;
  }

  try {
    await setCoordinatorPrayerNeedForDate(memberId, targetDate, prayerRaw);
    notifyRealtime(['calendar']);
    try {
      await sendPush(
        memberId,
        'Молитвенная нужда обновлена',
        'Координатор обновил вашу молитвенную нужду на выбранную дату.',
        { url: '/prayer', type: 'prayer_coordinator_update' },
      );
    } catch (pushErr) {
      console.warn('[calendar] prayer push notify failed (best-effort):', pushErr);
    }
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'member_mismatch') {
      res.status(400).json({ error: 'Участник не соответствует назначению на эту дату' });
      return;
    }
    if (msg === 'no_cycle') {
      res.status(400).json({ error: 'Нет активного молитвенного цикла' });
      return;
    }
    console.error('Calendar member-cycle-prayer PATCH error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getCycleCollectionClaims(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminOrCollectionCoordinator(req, res))) {
    return;
  }
  try {
    const authReq = req as AuthReq;
    const isAdmin = authReq.authUserRole === 'admin';
    const week = parseOptionalWeekKind(req.query?.week);
    const snapshot = await getCycleCollectionClaimsSnapshot(authReq.authUserId ?? null, isAdmin, week);
    res.json(snapshot);
  } catch (err) {
    console.error('Calendar cycle collection-claims GET error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

export async function patchCycleCollectionClaims(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return;
  }

  const memberId = parsePositiveInt(req.body?.member_id);
  const claim = req.body?.claim;
  if (memberId == null || typeof claim !== 'boolean') {
    res.status(400).json({ error: 'Ожидается { member_id: number, claim: boolean }' });
    return;
  }

  try {
    const week = parseOptionalWeekKind(req.body?.week);
    await setCycleCollectionClaim({
      authUserId: authReq.authUserId,
      authIsAdmin: authReq.authUserRole === 'admin',
      memberId,
      claim,
      weekKind: week,
    });
    const snapshot = await getCycleCollectionClaimsSnapshot(
      authReq.authUserId,
      authReq.authUserRole === 'admin',
      week
    );
    notifyRealtime(['calendar']);
    res.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'not_allowed') {
      res.status(403).json({ error: 'Нет прав на назначение сбора' });
      return;
    }
    if (msg === 'already_claimed') {
      res.status(409).json({ error: 'Этого участника уже выбрал другой ответственный' });
      return;
    }
    if (msg === 'not_owner') {
      res.status(400).json({ error: 'Можно снять только свою отметку' });
      return;
    }
    if (msg === 'invalid_member') {
      res.status(400).json({ error: 'Некорректный участник' });
      return;
    }
    console.error('Calendar cycle collection-claims PATCH error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}
