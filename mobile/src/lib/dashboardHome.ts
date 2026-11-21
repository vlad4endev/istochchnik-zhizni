import { format, parse, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';

import type {
  BirthdayWeekItem,
  BroadcastData,
  MemberProfileLite,
  ServicePlanDetailsLite,
} from '../api/dashboard';
import type { ServicePlanListItem } from '../api/servicePlanner';

/* ───────── Богослужение (ближайший план) ───────── */

export type SermonPlanPhase = 'upcoming' | 'live' | 'feedback' | 'closed';

const FEEDBACK_WINDOW_MS = 5 * 60 * 60_000;

export function parseServiceDateTime(
  plan: Pick<ServicePlanListItem, 'service_date' | 'start_time'>,
): Date | null {
  const date = String(plan.service_date ?? '').trim();
  const time = String(plan.start_time ?? '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const dt = new Date(`${date}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export type NearestPlan = {
  plan: ServicePlanListItem;
  phase: SermonPlanPhase;
  startsAt: Date;
};

function phaseOf(plan: ServicePlanListItem, now: Date): NearestPlan | null {
  const startsAt = parseServiceDateTime(plan);
  if (!startsAt) return null;
  const durationMin = Math.max(0, Number(plan.total_duration_minutes || 0));
  const endsAt = startsAt.getTime() + durationMin * 60_000;
  const nowMs = now.getTime();
  let phase: SermonPlanPhase;
  if (nowMs < startsAt.getTime()) phase = 'upcoming';
  else if (nowMs <= endsAt) phase = 'live';
  else if (nowMs <= endsAt + FEEDBACK_WINDOW_MS) phase = 'feedback';
  else phase = 'closed';
  return { plan, phase, startsAt };
}

/** Идущее или только что закончившееся служение важнее будущего; иначе — ближайшее будущее. */
export function pickNearestPlan(plans: ServicePlanListItem[], now: Date): NearestPlan | null {
  const rows = plans
    .map((p) => phaseOf(p, now))
    .filter((r): r is NearestPlan => r != null && r.phase !== 'closed');

  const started = rows
    .filter((r) => r.phase === 'live' || r.phase === 'feedback')
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  if (started[0]) return started[0];

  return (
    rows
      .filter((r) => r.phase === 'upcoming')
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null
  );
}

export type NearestSermonData = {
  planId: number;
  preacherMemberId: number;
  leaderMemberId: number | null;
  topic: string;
  scripture: string;
};

export function extractNearestSermonData(
  plan: ServicePlanDetailsLite | null | undefined,
): NearestSermonData | null {
  if (!plan?.preacher_member_id) return null;
  for (const block of plan.blocks) {
    const topic = block.content_json?.sermon_topic;
    const scripture = block.content_json?.sermon_scripture;
    if (
      typeof topic === 'string' &&
      typeof scripture === 'string' &&
      topic.trim() &&
      scripture.trim()
    ) {
      return {
        planId: plan.id,
        preacherMemberId: plan.preacher_member_id,
        leaderMemberId: plan.leader_member_id ?? null,
        topic: topic.trim(),
        scripture: scripture.trim(),
      };
    }
  }
  return null;
}

const WEEKDAY_SHORT = ['Вск', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

export function formatServiceCardDate(startsAt: Date | null | undefined): string {
  if (!startsAt) return '';
  return `${WEEKDAY_SHORT[startsAt.getDay()]}, ${format(startsAt, 'd MMMM yyyy', { locale: ru })}`;
}

export function profileDisplayName(
  profile: MemberProfileLite | null | undefined,
  fallback: string,
): string {
  if (!profile) return fallback;
  const full = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  return full || profile.display_name?.trim() || fallback;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/* ───────── Дни рождения ───────── */

export type BirthdayStatus = 'today' | 'tomorrow' | 'soon';
export type BirthdayWithStatus = BirthdayWeekItem & { status: BirthdayStatus };

const BIRTHDAY_ORDER: Record<BirthdayStatus, number> = { today: 0, tomorrow: 1, soon: 2 };

export function birthdaysThisWeek(
  items: BirthdayWeekItem[],
  now: Date,
): BirthdayWithStatus[] {
  const today = startOfDay(now).getTime();
  const out: BirthdayWithStatus[] = [];
  for (const b of items) {
    const d = parse(b.week_date, 'yyyy-MM-dd', new Date());
    if (Number.isNaN(d.getTime())) continue;
    const diff = Math.round((startOfDay(d).getTime() - today) / 86_400_000);
    const status: BirthdayStatus | null =
      diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff >= 2 && diff <= 6 ? 'soon' : null;
    if (status) out.push({ ...b, status });
  }
  return out.sort((a, b) => BIRTHDAY_ORDER[a.status] - BIRTHDAY_ORDER[b.status]);
}

export function formatBirthdayDate(weekDate: string): string {
  const d = parse(weekDate, 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? '' : format(d, 'EEE, d MMMM', { locale: ru });
}

/* ───────── Прямой эфир (та же логика, что на вебе) ───────── */

export const BROADCAST_SLOT_MS = 2 * 60 * 60 * 1000;

export type BroadcastUiMode = 'hidden' | 'pre' | 'onair' | 'post';

/** Время в БД без часового пояса — читаем как «настенное» локальное. */
export function parseBroadcastStartsAt(value: string | null | undefined): Date | null {
  const v = value?.trim();
  if (!v) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(v) && !v.includes('T')
    ? v.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
    : v;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getBroadcastUiMode(nowMs: number, b: BroadcastData | null): BroadcastUiMode {
  if (!b || b.status === 'finished') return 'hidden';
  const startsAtMs = parseBroadcastStartsAt(b.starts_at)?.getTime() ?? NaN;
  const hasStart = Number.isFinite(startsAtMs);
  const hasStream = Boolean(b.stream_url?.trim());
  const endMs = hasStart ? startsAtMs + BROADCAST_SLOT_MS : Number.POSITIVE_INFINITY;

  if (b.status === 'live') {
    if (!hasStart) return 'onair';
    return nowMs >= endMs ? 'post' : 'onair';
  }
  if (!hasStart) return 'hidden';
  if (nowMs >= endMs) return 'post';
  if (nowMs >= startsAtMs) return hasStream ? 'onair' : 'pre';
  return 'pre';
}

/** Виджет виден в эфире и за два часа до начала. */
export function shouldShowBroadcast(nowMs: number, b: BroadcastData | null): boolean {
  const mode = getBroadcastUiMode(nowMs, b);
  if (mode === 'onair') return true;
  if (mode !== 'pre') return false;
  const startsAtMs = parseBroadcastStartsAt(b?.starts_at)?.getTime() ?? NaN;
  return Number.isFinite(startsAtMs) && nowMs >= startsAtMs - BROADCAST_SLOT_MS;
}

export function formatBroadcastTimer(nowMs: number, b: BroadcastData | null): string {
  const startsAtMs = parseBroadcastStartsAt(b?.starts_at)?.getTime() ?? NaN;
  if (!b || !Number.isFinite(startsAtMs)) return '—';
  const mode = getBroadcastUiMode(nowMs, b);
  if (mode === 'post' || mode === 'hidden') return '—';
  const diff = mode === 'onair' ? Math.max(0, nowMs - startsAtMs) : Math.max(0, startsAtMs - nowMs);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function broadcastPlatformLabel(platform: string | null | undefined): string {
  const p = String(platform ?? '').toLowerCase();
  if (p === 'youtube') return 'YouTube';
  if (p === 'rutube') return 'RuTube';
  if (p === 'vk') return 'VK Видео';
  return 'Платформа';
}
