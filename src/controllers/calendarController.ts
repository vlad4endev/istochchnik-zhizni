import { Request, Response } from 'express';
import { AiAgentError, chatCompletion } from '../ai';
import { query } from '../config/db';
import {
  countPrayerSectionVisitorsForDate,
  getMemberAssignmentsForWeek,
  getPrayerDataByDate,
  getPrayerSectionStatsDateYmd,
  recordPrayerSectionVisitForMember,
  type WeekPlanKind,
} from '../services/calendarService';
import {
  addManualPreviousPrayerNeed,
  deleteManualPreviousPrayerNeed,
  setCoordinatorPrayerNeedForDate,
  updateManualPreviousPrayerNeed,
} from '../services/userService';
import {
  getCycleCollectionClaimsSnapshot,
  setCycleCollectionClaim,
} from '../services/cycleCollectionClaimsService';
import { notifyRealtime } from '../realtime/notify';
import { sendPush } from '../services/pushService';
import { DistributionService, getNextIsoWeekRef } from '../services/DistributionService';

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
  const today = formatYmdLocal(now);

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

/** Календарная дата в локальной TZ сервера (без сравнения через getTime — стабильнее для «сегодня»). */
function calendarYmdLocal(d: Date): { y: number; m: number; day: number } {
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}

function compareCalendarYmd(
  a: { y: number; m: number; day: number },
  b: { y: number; m: number; day: number },
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.day - b.day;
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

/** DATE из Postgres может прийти как `YYYY-MM-DD` или с хвостом — берём первые 10 символов. */
function normalizeBirthDateYmd(raw: string): string | null {
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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

    /** Не показывать дни рождения, которые уже прошли в текущей неделе (только с сегодня и до вс). */
    const todayYmd = calendarYmdLocal(now);

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
      const birthYmd = normalizeBirthDateYmd(row.birth_date);
      if (!birthYmd) continue;
      const personName = fullNameOrFallback(row);

      let hit: Date | null = null;
      for (const y of years) {
        const b = birthdayForYear(birthYmd, y);
        if (!b) continue;
        if (b.getTime() >= weekStart.getTime() && b.getTime() <= weekEnd.getTime()) {
          hit = b;
          break;
        }
      }
      if (!hit) continue;
      if (compareCalendarYmd(calendarYmdLocal(hit), todayYmd) < 0) continue;

      out.push({
        id: row.id,
        name: personName,
        birth_date: birthYmd,
        week_date: formatYmdLocal(hit),
      });
    }

    out.sort((a, b) => {
      const byDate = a.week_date.localeCompare(b.week_date);
      if (byDate !== 0) return byDate;
      return a.name.localeCompare(b.name, 'ru');
    });

    res.setHeader('Cache-Control', 'no-store');
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

type AuthReq = Request & { authUserId?: number; authUserRole?: import('../types/appRole').AppRole };

/** План недели и назначения сбора — администратор, пастор или ответственный за сбор. */
async function assertAdminPastorOrCollectionCoordinator(req: Request, res: Response): Promise<boolean> {
  const authReq = req as AuthReq;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }
  if (authReq.authUserRole === 'admin' || authReq.authUserRole === 'pastor') {
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

  res.status(403).json({ error: 'Нет доступа к разделу плана недели' });
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
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
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

function stripCommonAssistantWrappers(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)\n?```\s*$/m.exec(s);
  if (fence && typeof fence[1] === 'string') {
    s = fence[1].trim();
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('«') && s.endsWith('»'))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Улучшение черновика молитвенной нужды через ИИ (промпт раздела «Молитвенный календарь» в админке).
 */
export async function postPrayerNeedImproveText(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }

  const rawText = req.body?.text;
  if (typeof rawText !== 'string') {
    res.status(400).json({ error: 'Ожидается text (строка)' });
    return;
  }
  const trimmed = rawText.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'Введите текст нужды, чтобы улучшить его' });
    return;
  }

  const memberNameRaw = req.body?.member_name;
  const memberName =
    typeof memberNameRaw === 'string' && memberNameRaw.trim().length > 0 ? memberNameRaw.trim() : '';

  const userBlock = memberName
    ? `Участник цикла: ${memberName}.\n\nТекст молитвенной нужды:\n${trimmed}`
    : `Текст молитвенной нужды:\n${trimmed}`;

  try {
    const improved = await chatCompletion(
      [
        {
          role: 'user',
          content: `${userBlock}

Отредактируй текст: сделай его ясным, бережным, без лишних слов. Сохрани смысл и личные детали. Верни только готовый текст одной нужды, без заголовков и без кавычек вокруг всего ответа.`,
        },
      ],
      { section: 'calendar', temperature: 0.35, max_tokens: 2500 },
    );
    const out = stripCommonAssistantWrappers(improved);
    if (!out) {
      res.status(502).json({ error: 'Модель вернула пустой ответ' });
      return;
    }
    res.json({ text: out });
  } catch (e) {
    if (e instanceof AiAgentError) {
      const status =
        e.code === 'ai_disabled'
          ? 409
          : e.code === 'ai_not_configured'
            ? 400
            : e.code === 'ai_http_error'
              ? e.status && e.status >= 400 && e.status < 600
                ? e.status
                : 502
              : 502;
      res.status(status).json({
        error: e.message,
        code: e.code,
        details: e.bodySnippet ? { bodySnippet: e.bodySnippet } : undefined,
      });
      return;
    }
    console.error('[calendar] prayer-need improve-text error:', e);
    res.status(500).json({ error: 'Не удалось улучшить текст' });
  }
}

export async function patchMemberCyclePrayer(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
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

export async function patchMemberPreviousPrayerNeed(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }
  const authReq = req as AuthReq;
  const memberId = parsePositiveInt(req.body?.member_id);
  const noteRaw = req.body?.note;
  if (memberId == null || typeof noteRaw !== 'string') {
    res.status(400).json({ error: 'Ожидается { member_id: number, note: string }' });
    return;
  }
  try {
    await addManualPreviousPrayerNeed(memberId, noteRaw, authReq.authUserId ?? null);
    notifyRealtime(['calendar']);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'empty_note') {
      res.status(400).json({ error: 'Текст предыдущей нужды не может быть пустым' });
      return;
    }
    console.error('Calendar member-previous-prayer-need PATCH error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function putMemberPreviousPrayerNeed(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }
  const id = parsePositiveInt(req.params?.id);
  const noteRaw = req.body?.note;
  if (id == null || typeof noteRaw !== 'string') {
    res.status(400).json({ error: 'Ожидается { note: string } и валидный id' });
    return;
  }
  try {
    const updated = await updateManualPreviousPrayerNeed(id, noteRaw);
    if (!updated) {
      res.status(404).json({ error: 'Запись не найдена' });
      return;
    }
    notifyRealtime(['calendar']);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'empty_note') {
      res.status(400).json({ error: 'Текст предыдущей нужды не может быть пустым' });
      return;
    }
    console.error('Calendar member-previous-prayer-need PUT error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteMemberPreviousPrayerNeed(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }
  const id = parsePositiveInt(req.params?.id);
  if (id == null) {
    res.status(400).json({ error: 'Ожидается валидный id' });
    return;
  }
  try {
    const deleted = await deleteManualPreviousPrayerNeed(id);
    if (!deleted) {
      res.status(404).json({ error: 'Запись не найдена' });
      return;
    }
    notifyRealtime(['calendar']);
    res.json({ ok: true });
  } catch (err) {
    console.error('Calendar member-previous-prayer-need DELETE error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getCycleCollectionClaims(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }
  try {
    const authReq = req as AuthReq;
    const isAdmin = authReq.authUserRole === 'admin';
    const isPastor = authReq.authUserRole === 'pastor';
    const week = parseOptionalWeekKind(req.query?.week);
    const snapshot = await getCycleCollectionClaimsSnapshot(
      authReq.authUserId ?? null,
      isAdmin,
      isPastor,
      week,
    );
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
    const assignedCoordinatorId = parsePositiveInt(req.body?.assigned_coordinator_id);
    const assignMode = assignedCoordinatorId != null;
    const authIsAdmin = authReq.authUserRole === 'admin';
    const authIsPastor = authReq.authUserRole === 'pastor';
    await setCycleCollectionClaim({
      authUserId: authReq.authUserId,
      authIsAdmin,
      authIsPastor,
      memberId,
      claim,
      assignedCoordinatorId: assignedCoordinatorId ?? undefined,
      weekKind: week,
    });
    if (assignMode && claim && assignedCoordinatorId != null) {
      const snapshotForPush = await getCycleCollectionClaimsSnapshot(
        authReq.authUserId,
        authIsAdmin,
        authIsPastor,
        week,
      );
      const row = snapshotForPush.members.find((m) => m.id === memberId);
      const target = snapshotForPush.coordinators.find((c) => c.id === assignedCoordinatorId);
      const memberName = row?.name?.trim() || `Участник #${memberId}`;
      if (target) {
        const actorLabel = authIsPastor
          ? 'Пастор'
          : authIsAdmin
            ? 'Администратор'
            : 'Координатор сбора';
        const weekLabel = week === 'current' ? 'эту' : 'следующую';
        void sendPush(
          assignedCoordinatorId,
          'Сбор молитвенных нужд: новое назначение',
          `${actorLabel} назначил(а) вам участника ${memberName} на ${weekLabel} неделю.`,
          {
            url: '/dashboard',
            type: 'curator_assignment_by_pastor',
            week_kind: week ?? 'next',
          },
        ).catch((pushErr) => {
          console.warn('[calendar] curator assignment push failed:', pushErr);
        });
      }
    }
    const snapshot = await getCycleCollectionClaimsSnapshot(
      authReq.authUserId,
      authIsAdmin,
      authIsPastor,
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
    if (msg === 'invalid_coordinator') {
      res.status(400).json({ error: 'Некорректный куратор для назначения' });
      return;
    }
    console.error('Calendar cycle collection-claims PATCH error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postCuratorDistribution(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }

  try {
    const weekKindRaw = req.body?.week_kind;
    const weekKind: WeekPlanKind = weekKindRaw === 'current' ? 'current' : 'next';
    const notifyCurators = req.body?.notify_curators !== false;
    const service = new DistributionService();
    const result = await service.executeAndSaveForCollectionQueueWeek(weekKind);

    const assignmentsView = await service.getAssignmentsForWeek(result.week);
    const groupedByCurator = service.groupAssignmentsByCurator(assignmentsView);
    let pushedCoordinators = 0;
    if (notifyCurators) {
      const coordinatorAssignments = await service.getCoordinatorAssignmentsForQueueWeek(weekKind);
      for (const row of coordinatorAssignments) {
        if (row.members.length <= 0) {
          continue;
        }
        const namesPreview = row.members.slice(0, 5).map((m) => m.memberName).join(', ');
        const suffix = row.members.length > 5 ? ` и еще ${row.members.length - 5}` : '';
        const body = `На ${weekKind === 'current' ? 'эту' : 'следующую'} неделю вам назначено ${row.members.length} участник(ов): ${namesPreview}${suffix}.`;
        try {
          await sendPush(row.coordinatorId, 'Сбор молитвенных нужд: новые назначения', body, {
            url: '/dashboard',
            type: 'curator_week_assignments_manual',
            week_kind: weekKind,
            week_start: row.weekStartDate,
            cycle_index: String(row.cycleIndex),
          });
          pushedCoordinators += 1;
        } catch (pushErr) {
          console.warn('[calendar] curator distribution push failed:', pushErr);
        }
      }
    }
    notifyRealtime(['calendar']);
    res.json({
      ok: true,
      week_kind: weekKind,
      week: result.week,
      cycle_index: result.cycleIndex,
      total: result.assignments.length,
      assignments: result.assignments,
      grouped_by_curator: groupedByCurator,
      notify_curators: notifyCurators,
      pushed_coordinators: pushedCoordinators,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No available curators for distribution')) {
      res.status(400).json({
        error: 'Нет кураторов сбора: отметьте у участников роль «Координатор сбора» или добавьте активных кураторов.',
      });
      return;
    }
    if (msg.includes('Supabase is not configured')) {
      res.status(503).json({
        error: 'На сервере не настроены SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY — без них запись назначений в хранилище невозможна.',
      });
      return;
    }
    if (msg === 'No active prayer cycle for selected queue week') {
      res.status(400).json({ error: 'Нет активного молитвенного цикла для выбранной недели.' });
      return;
    }
    console.error('Calendar curator distribution POST error:', err);
    res.status(500).json({ error: 'Не удалось выполнить распределение кураторов' });
  }
}

export async function getCuratorDistributionTargetWeek(_req: Request, res: Response): Promise<void> {
  const week = getNextIsoWeekRef();
  res.json({ week });
}

export async function getCuratorDistribution(req: Request, res: Response): Promise<void> {
  if (!(await assertAdminPastorOrCollectionCoordinator(req, res))) {
    return;
  }

  try {
    const queryWeek = req.query?.week;
    const queryYear = req.query?.year;
    const week =
      typeof queryWeek === 'string' &&
      typeof queryYear === 'string' &&
      /^\d+$/.test(queryWeek) &&
      /^\d+$/.test(queryYear)
        ? { weekNumber: Number(queryWeek), year: Number(queryYear) }
        : getNextIsoWeekRef();

    const service = new DistributionService();
    const assignments = await service.getAssignmentsForWeek(week);
    const groupedByCurator = service.groupAssignmentsByCurator(assignments);
    res.json({
      week,
      total: assignments.length,
      assignments,
      grouped_by_curator: groupedByCurator,
    });
  } catch (err) {
    console.error('Calendar curator distribution GET error:', err);
    res.status(500).json({ error: 'Не удалось получить распределение кураторов' });
  }
}

type AuthRequest = Request & { authUserId?: number };

export async function postPrayerSectionVisit(req: Request, res: Response): Promise<void> {
  const memberId = (req as AuthRequest).authUserId;
  if (!memberId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    await recordPrayerSectionVisitForMember(memberId);
    res.json({ ok: true });
  } catch (err) {
    console.error('postPrayerSectionVisit error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getPrayerSectionTodayViewers(_req: Request, res: Response): Promise<void> {
  try {
    const visitDateYmd = getPrayerSectionStatsDateYmd();
    const unique_viewers_today = await countPrayerSectionVisitorsForDate(visitDateYmd);
    res.json({ date: visitDateYmd, unique_viewers_today });
  } catch (err) {
    console.error('getPrayerSectionTodayViewers error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}
