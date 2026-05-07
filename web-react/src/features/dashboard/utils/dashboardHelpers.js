import { addDays, format, isBefore, parse, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';

export function isSermonRelevant(sermon) {
  if (!sermon?.date) return false;
  const value = sermon.date instanceof Date ? sermon.date : new Date(sermon.date);
  if (Number.isNaN(value.getTime())) return false;
  return value.getTime() >= startOfDay(new Date()).getTime();
}

export function isStreamLive(stream) {
  if (!stream) return false;
  if (String(stream.status ?? '').toLowerCase() === 'live') return true;
  const now = Date.now();
  const startMs = stream.startTime ? new Date(stream.startTime).getTime() : NaN;
  const endMs = stream.endTime ? new Date(stream.endTime).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return startMs <= now && now <= endMs;
}

export function getUpcomingBirthdays(members, days = 7) {
  if (!Array.isArray(members)) return [];
  const from = startOfDay(new Date());
  const to = addDays(from, days);
  return members.filter((item) => {
    const raw = String(item?.week_date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    const dt = parse(raw, 'yyyy-MM-dd', new Date());
    if (Number.isNaN(dt.getTime())) return false;
    return !isBefore(dt, from) && dt.getTime() <= to.getTime();
  });
}

export function getTimeUntilService(nextServiceDate) {
  if (!nextServiceDate) return null;
  const targetMs = new Date(nextServiceDate).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const diff = targetMs - Date.now();
  if (diff <= 0) return 'начинается сейчас';
  const totalMin = Math.floor(diff / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}д ${hours}ч ${mins}м`;
  if (hours > 0) return `${hours}ч ${mins}м`;
  return `${Math.max(1, mins)}м`;
}

export function formatBirthdayLabel(weekDate) {
  const dt = parse(String(weekDate ?? ''), 'yyyy-MM-dd', new Date());
  if (Number.isNaN(dt.getTime())) return 'скоро';
  return format(dt, 'd MMMM', { locale: ru });
}
