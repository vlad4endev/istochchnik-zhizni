import { apiClient } from './client';

/* ───────── Срочная нужда и объявление координаторов ───────── */

export type NoteKind = 'urgent_prayer' | 'announcement';
export type NoteDuration = 'day' | 'week' | 'month';

export type CoordinatorNote = { text: string; start_date: string; end_date: string };
export type CoordinatorNotes = {
  urgent_prayer: CoordinatorNote | null;
  announcement: CoordinatorNote | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseNote(raw: unknown): CoordinatorNote | null {
  if (!isRecord(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const start = typeof raw.start_date === 'string' ? raw.start_date : '';
  const end = typeof raw.end_date === 'string' ? raw.end_date : '';
  return text && start && end ? { text, start_date: start, end_date: end } : null;
}

function parseNotes(raw: unknown): CoordinatorNotes {
  const o = isRecord(raw) ? raw : {};
  return { urgent_prayer: parseNote(o.urgent_prayer), announcement: parseNote(o.announcement) };
}

/** Записи, видимые на календарную дату `forDate` (YYYY-MM-DD). */
export async function fetchCoordinatorNotes(forDate: string): Promise<CoordinatorNotes> {
  const { data } = await apiClient.get<unknown>('/api/calendar/dashboard-coordinator-notes', {
    params: { for_date: forDate },
  });
  return parseNotes(data);
}

/** Текущие записи, в том числе с истёкшим сроком (для редактора). */
export async function fetchCoordinatorNotesForManage(): Promise<CoordinatorNotes> {
  const { data } = await apiClient.get<unknown>('/api/calendar/dashboard-coordinator-notes', {
    params: { scope: 'manage' },
  });
  return parseNotes(data);
}

export async function saveCoordinatorNote(input: {
  kind: NoteKind;
  text: string;
  duration: NoteDuration;
  today_key: string;
}): Promise<CoordinatorNotes> {
  const { data } = await apiClient.post<unknown>('/api/calendar/dashboard-coordinator-notes', input);
  return parseNotes(data);
}

export async function deleteCoordinatorNote(
  kind: NoteKind,
  forDate?: string,
): Promise<CoordinatorNotes> {
  const { data } = await apiClient.delete<unknown>(
    `/api/calendar/dashboard-coordinator-notes/${encodeURIComponent(kind)}`,
    { params: forDate ? { for_date: forDate } : {} },
  );
  return parseNotes(data);
}

/** Какой срок показа выбрать по сохранённым датам (как на сервере при сохранении). */
export function inferNoteDuration(startYmd: string, endYmd: string): NoteDuration {
  if (startYmd === endYmd) return 'day';
  const [y, m, d] = startYmd.split('-').map(Number);
  if (!y || !m || !d) return 'day';
  const start = new Date(y, m - 1, d);
  const daysToSunday = (7 - start.getDay()) % 7;
  const sunday = new Date(y, m - 1, d + daysToSunday);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (fmt(sunday) === endYmd) return 'week';
  if (fmt(new Date(y, m, 0)) === endYmd) return 'month';
  return 'day';
}

/* ───────── Кто открывал раздел сегодня (админ / пастор) ───────── */

export type PrayerViewer = {
  member_id: number;
  name: string;
  avatar_url: string | null;
  first_seen_at: string;
};

export type PrayerViewersToday = {
  date: string;
  unique_viewers_today: number;
  viewers: PrayerViewer[];
};

export async function fetchPrayerViewersToday(): Promise<PrayerViewersToday> {
  const { data } = await apiClient.get<unknown>('/api/calendar/prayer-section/today-viewers');
  const o = isRecord(data) ? data : {};
  const viewers: PrayerViewer[] = [];
  if (Array.isArray(o.viewers)) {
    for (const v of o.viewers) {
      if (!isRecord(v)) continue;
      const id = Number(v.member_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      viewers.push({
        member_id: id,
        name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : `#${id}`,
        avatar_url: typeof v.avatar_url === 'string' ? v.avatar_url : null,
        first_seen_at: typeof v.first_seen_at === 'string' ? v.first_seen_at : '',
      });
    }
  }
  const count = Number(o.unique_viewers_today);
  return {
    date: typeof o.date === 'string' ? o.date : '',
    unique_viewers_today: Number.isFinite(count) ? count : viewers.length,
    viewers,
  };
}

/** «человек / человека / человек» для числа посетителей. */
export function ruVisitorsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'человек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'человека';
  return 'человек';
}

/* ───────── ИИ-улучшение текста нужды (куратор) ───────── */

export async function improvePrayerNeedText(text: string, memberName?: string): Promise<string> {
  const { data } = await apiClient.post<{ text?: unknown }>(
    '/api/calendar/prayer-need/improve-text',
    { text, member_name: memberName?.trim() ?? '' },
  );
  if (typeof data?.text !== 'string') throw new Error('Некорректный ответ: нет текста');
  return data.text;
}

/* ───────── Рассылка молитвы в Telegram (админ) ───────── */

export type DispatchSettings = {
  enabled: boolean;
  kind: 'daily' | 'once';
  time_hhmm: string | null;
  once_at_local: string | null;
  target: 'all' | 'selected';
  member_ids: number[];
  server_timezone: string;
  last_sent_label: string | null;
};

export type DispatchRecipient = {
  id: number;
  name: string;
  telegram_chat_id: string;
  telegram_delivery_blocked: boolean;
};

export async function fetchDispatchSettings(): Promise<DispatchSettings> {
  const { data } = await apiClient.get<DispatchSettings>('/api/telegram/dispatch/settings');
  return data;
}

export async function patchDispatchSettings(
  body: Partial<DispatchSettings>,
): Promise<DispatchSettings> {
  const { data } = await apiClient.patch<DispatchSettings>(
    '/api/telegram/dispatch/settings',
    body,
  );
  return data;
}

export async function fetchDispatchRecipients(): Promise<DispatchRecipient[]> {
  const { data } = await apiClient.get<DispatchRecipient[]>('/api/telegram/dispatch/recipients');
  return data ?? [];
}

export async function fetchDispatchPreview(dateYmd: string): Promise<{ text: string; date: string }> {
  const { data } = await apiClient.get<{ text: string; date: string }>(
    '/api/telegram/dispatch/preview-prayer',
    { params: { date: dateYmd } },
  );
  return data;
}

export async function runDispatchNow(dateYmd: string): Promise<{ sent_count: number }> {
  const { data } = await apiClient.post<{ sent_count: number }>(
    '/api/telegram/dispatch/run-now',
    { date: dateYmd },
  );
  return data;
}

export async function fetchTelegramBotEnabled(): Promise<boolean> {
  const { data } = await apiClient.get<{ enabled?: boolean }>('/api/telegram/settings');
  return data?.enabled === true;
}

export async function testTelegramBot(): Promise<{ username: string | null; id: number }> {
  const { data } = await apiClient.post<{ username: string | null; id: number }>(
    '/api/telegram/test-connection',
    {},
  );
  return data;
}

/** Понятное сообщение вместо технической ошибки Telegram/сервера. */
export function humanizeTelegramError(err: unknown, fallback: string): string {
  const msg = err instanceof Error && err.message ? err.message : fallback;
  if (msg.includes('Telegram модуль выключен')) return 'Telegram-модуль выключен. Включите его в настройках.';
  if (msg.includes('Не задан Telegram Bot Token')) return 'Не задан токен бота. Добавьте его в настройках.';
  if (msg.includes('Не найдено пользователей с заполненным Telegram ID')) {
    return 'Нет получателей: заполните Telegram ID у участников.';
  }
  if (msg.includes('Telegram API вернул ошибку при отправке')) {
    return 'Telegram отклонил отправку. Проверьте токен бота и chat_id.';
  }
  return msg;
}
