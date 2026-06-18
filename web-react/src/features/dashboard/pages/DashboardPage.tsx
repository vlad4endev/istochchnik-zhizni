import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, isBefore, parse, startOfDay, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuArrowRight,
  LuCalendarDays,
  LuCalendarRange,
  LuCheck,
  LuChurch,
  LuExternalLink,
  LuEye,
  LuHandHeart,
  LuHeadphones,
  LuMic,
  LuMinus,
  LuPause,
  LuPlay,
  LuStar,
  LuUser,
  LuX,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';

import { fetchActiveBroadcast, type BroadcastData } from '../../../api/broadcast';
import { useBroadcastViewers } from '../../../hooks/useBroadcastViewers';
import {
  BROADCAST_SLOT_MS,
  formatBroadcastMainTimer,
  getBroadcastUiMode,
  shouldShowBroadcastWidget,
  type BroadcastUiMode,
} from '../../../utils/broadcastDisplay';
import { parseBroadcastStartsAt } from '../../../utils/broadcastStartsAt';
import { fetchPodcastFeed, type PodcastEpisode } from '../../../api/resources';
import {
  deleteDashboardCoordinatorNote,
  fetchDashboardCoordinatorNotes,
  getCycleCollectionClaims,
  getWeekBirthdays,
  formatCalendarDayKey,
  getActiveEvents,
  getCalendarDay,
  getWeekPlanMembers,
  type BirthdayWeekItem,
  type ChurchEventItem,
} from '../../calendar/api';
import { NextWeekPrayerPlanSection } from '../../calendar/components/NextWeekPrayerPlanSection';
import { userCanViewNextWeekPrayerPlan } from '../../calendar/prayerAccess';
import { fetchRolePermissionsPublic } from '../../settings/rolePermissionsApi';
import { useMe } from '@/hooks/useMe';
import { fetchProfileByMemberId, fetchProfileByUsername } from '../../profile/publicProfileApi';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClassNested } from '../../../lib/sectionHeroChrome';
import { apiBoolean } from '../../../lib/apiBoolean';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberRosterName } from '../../../lib/memberRosterName';
import { pluralizeRu } from '../../../lib/pluralizeRu';
import type { Member } from '../../../types';
import { useAuthStore } from '../../auth/authStore';
import { useProfileDraftStore } from '../../profile/profileDraftStore';
import { useCoordinatorNoteEditorRequestStore } from '../coordinatorNoteEditorRequestStore';
import { LimitedRegistrationDashboard } from '../components/LimitedRegistrationDashboard';
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import { keys } from '@/lib/queryKeys';
import { fetchServicePlan, fetchServicePlans, type ServicePlanDetails, type ServicePlanListItem } from '../../servicePlanner/api';

type DashboardEvent = {
  id: string;
  title: string;
  description: string;
  whenLabel: string;
  posterUrl: string | null;
};

function formatTodayLabel(now: Date): string {
  return `Сегодня ${format(now, 'EEEE, d MMMM', { locale: ru })}`;
}

function isPrayerNeedFilled(member: Member): boolean {
  return (member.prayer_request ?? '').trim().length > 0;
}

function pickLatestEpisode(episodes: PodcastEpisode[]): PodcastEpisode | null {
  if (!episodes.length) return null;
  return [...episodes].sort((a, b) => {
    const at = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const bt = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return bt - at;
  })[0] ?? null;
}

function formatEpisodeDuration(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function formatEpisodePubDate(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function dashboardEpisodeSubtitle(ep: PodcastEpisode): string {
  const parts: string[] = [];
  const d = formatEpisodePubDate(ep.pubDate);
  const t = formatEpisodeDuration(ep.duration);
  if (d) parts.push(d);
  if (t) parts.push(t);
  return parts.join(' • ');
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseOnceEventDateTime(item: ChurchEventItem): Date | null {
  const ts = `${item.event_date}T${item.event_time}:00`;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextWeeklyDate(now: Date, weeklyDay: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  const base = new Date(now);
  const diff = (weeklyDay - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  base.setHours(h, m, 0, 0);
  if (base.getTime() < now.getTime()) {
    base.setDate(base.getDate() + 7);
  }
  return base;
}

function eventNextOccurrence(now: Date, item: ChurchEventItem): Date | null {
  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    return nextWeeklyDate(now, weeklyDay, item.event_time);
  }
  return parseOnceEventDateTime(item);
}

function toDashboardEvent(now: Date, item: ChurchEventItem, date: Date): DashboardEvent {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const timeLabel = format(date, 'HH:mm');
  const whenLabel = sameDate(date, now)
    ? `Сегодня в ${timeLabel}`
    : sameDate(date, tomorrow)
      ? `Завтра в ${timeLabel}`
      : `${format(date, 'EEEE', { locale: ru })} в ${timeLabel}`;
  return {
    id: String(item.id),
    title: item.title.trim() || 'Событие',
    description: (item.description ?? '').trim() || 'Подробное описание скоро появится.',
    whenLabel,
    posterUrl: resolvePublicUrl(item.poster_url ?? null),
  };
}

function pickUpcomingEvent(now: Date, items: ChurchEventItem[]): DashboardEvent {
  const rows = items
    .map((item) => {
      const dt = eventNextOccurrence(now, item);
      return dt ? { item, dt } : null;
    })
    .filter((x): x is { item: ChurchEventItem; dt: Date } => x != null)
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());

  if (rows.length === 0) {
    return {
      id: 'no-events',
      title: 'Событий пока нет',
      description: 'Администратор скоро добавит новые события.',
      whenLabel: 'Следите за обновлениями',
      posterUrl: null,
    };
  }

  const todayRow = rows.find((x) => sameDate(x.dt, now) && x.dt.getTime() >= now.getTime())
    ?? rows.find((x) => sameDate(x.dt, now));
  if (todayRow) return toDashboardEvent(now, todayRow.item, todayRow.dt);

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowRow = rows.find((x) => sameDate(x.dt, tomorrow));
  if (tomorrowRow) return toDashboardEvent(now, tomorrowRow.item, tomorrowRow.dt);

  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const nearestWeek = rows.find((x) => x.dt.getTime() > now.getTime() && x.dt.getTime() <= weekEnd.getTime());
  if (nearestWeek) return toDashboardEvent(now, nearestWeek.item, nearestWeek.dt);

  const nearestAny = rows.find((x) => x.dt.getTime() > now.getTime()) ?? rows[0];
  return toDashboardEvent(now, nearestAny.item, nearestAny.dt);
}

function formatBirthdayChipDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'EEE, d MMM', { locale: ru });
}

function formatWeekDayChip(ymd: string): string {
  const d = parse(ymd, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) return ymd;
  return format(d, 'EEE d.MM', { locale: ru });
}

function truncatePrayerNeedPreview(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** Фамилия и имя для подписи в дашборде (как в списках). */
function memberFirstLastLine(m: Member): string {
  const s = memberRosterName(m).trim();
  return s || m.name.trim() || '—';
}

function formatBroadcastDateTime(value: string | null): string {
  const d = parseBroadcastStartsAt(value);
  if (!d) return '—';
  return format(d, 'dd.MM.yyyy HH:mm');
}

function mapPlatformLabel(platform: string | null | undefined): string {
  const p = String(platform ?? '').toLowerCase();
  if (p === 'youtube') return 'YouTube';
  if (p === 'rutube') return 'RuTube';
  if (p === 'vk') return 'VK Видео';
  return 'Платформа';
}

function parseServiceDateTime(plan: Pick<ServicePlanListItem, 'service_date' | 'start_time'>): Date | null {
  const date = String(plan.service_date ?? '').trim();
  const time = String(plan.start_time ?? '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const dt = new Date(`${date}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function preacherInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return 'П';
  return parts.map((x) => x[0]?.toUpperCase() ?? '').join('');
}

function buildBibleVerseUrl(scripture: string): string {
  const q = scripture.trim();
  return `https://www.bible.com/ru/search/bible?q=${encodeURIComponent(q)}`;
}

function preacherNameTwoLines(name: string): string {
  const parts = name.trim().split(/\s+/).filter((x) => x.length > 0);
  if (parts.length <= 1) return name;
  return `${parts[0]}\n${parts.slice(1).join(' ')}`;
}

type SermonPlanPhase = 'upcoming' | 'live' | 'feedback' | 'closed';

function computeSermonPlanPhase(
  plan: Pick<ServicePlanListItem, 'service_date' | 'start_time' | 'total_duration_minutes'>,
  now: Date,
): { phase: SermonPlanPhase; startsAt: Date | null; endsAt: Date | null; feedbackEndsAt: Date | null } {
  const startsAt = parseServiceDateTime(plan);
  if (!startsAt) return { phase: 'closed', startsAt: null, endsAt: null, feedbackEndsAt: null };
  const durationMin = Math.max(0, Number(plan.total_duration_minutes || 0));
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  const feedbackEndsAt = new Date(endsAt.getTime() + 5 * 60 * 60_000);
  const nowMs = now.getTime();
  if (nowMs < startsAt.getTime()) return { phase: 'upcoming', startsAt, endsAt, feedbackEndsAt };
  if (nowMs <= endsAt.getTime()) return { phase: 'live', startsAt, endsAt, feedbackEndsAt };
  if (nowMs <= feedbackEndsAt.getTime()) return { phase: 'feedback', startsAt, endsAt, feedbackEndsAt };
  return { phase: 'closed', startsAt, endsAt, feedbackEndsAt };
}

function pickNearestPlan(
  plans: ServicePlanListItem[],
  now: Date,
): { plan: ServicePlanListItem; phase: SermonPlanPhase; startsAt: Date; endsAt: Date; feedbackEndsAt: Date } | null {
  const dated = plans
    .map((plan) => {
      const phaseData = computeSermonPlanPhase(plan, now);
      if (!phaseData.startsAt || !phaseData.endsAt || !phaseData.feedbackEndsAt) return null;
      return { plan, ...phaseData };
    })
    .filter(
      (
        row,
      ): row is {
        plan: ServicePlanListItem;
        phase: SermonPlanPhase;
        startsAt: Date;
        endsAt: Date;
        feedbackEndsAt: Date;
      } => row != null,
    )
    .filter((row) => row.phase !== 'closed');

  const started = dated
    .filter((row) => row.phase === 'live' || row.phase === 'feedback')
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  if (started[0]) return started[0];

  const upcoming = dated
    .filter((row) => row.phase === 'upcoming')
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return upcoming[0] ?? null;
}

type NearestSermonData = {
  planId: number;
  shareToken: string;
  serviceDate: string;
  startTime: string;
  preacherMemberId: number;
  topic: string;
  scripture: string;
};

function extractNearestSermonData(plan: ServicePlanDetails | null): NearestSermonData | null {
  if (!plan?.preacher_member_id) return null;
  const sermonBlock = plan.blocks.find((block) => {
    const topicRaw = block.content_json?.sermon_topic;
    const scriptureRaw = block.content_json?.sermon_scripture;
    const topic = typeof topicRaw === 'string' ? topicRaw.trim() : '';
    const scripture = typeof scriptureRaw === 'string' ? scriptureRaw.trim() : '';
    return topic.length > 0 && scripture.length > 0;
  });
  if (!sermonBlock) return null;
  return {
    planId: plan.id,
    shareToken: plan.share_token,
    serviceDate: plan.service_date,
    startTime: plan.start_time,
    preacherMemberId: plan.preacher_member_id,
    topic: String(sermonBlock.content_json.sermon_topic).trim(),
    scripture: String(sermonBlock.content_json.sermon_scripture).trim(),
  };
}

function UpcomingPreacherCard({
  preacherName,
  preacherAvatarUrl,
  topic,
  scripture,
  dateLabel,
  canRate,
  onOpenComments,
}: {
  preacherName: string;
  preacherAvatarUrl: string | null;
  topic: string;
  scripture: string;
  dateLabel: string;
  canRate: boolean;
  onOpenComments: () => void;
}) {
  const initials = preacherInitials(preacherName);
  const scriptureUrl = buildBibleVerseUrl(scripture);
  const preacherNameDisplay = preacherNameTwoLines(preacherName);
  return (
    <section className="dashboard-sermon-card w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#E8E0DC] bg-white max-lg:shadow-none sm:max-w-[420px] lg:max-w-none lg:shadow-[var(--shadow-card)]">
      <div className="dashboard-sermon-card__hero flex min-w-0 items-end gap-3 bg-[#6B2D3E] px-4 pt-4 sm:gap-4 sm:px-5 sm:pt-5 lg:bg-gradient-to-br lg:from-[#6B2D3E] lg:to-[#7F364D]">
        <div className="min-w-0 flex-1 pb-3 sm:pb-4">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#EAC7D2]">Проповедь</p>
          <p className="mt-2 whitespace-pre-line break-words text-[28px] font-semibold leading-[1.08] text-white sm:text-[34px] lg:text-[38px]">
            {preacherNameDisplay}
          </p>
        </div>
        <div className="h-[84px] w-[70px] shrink-0 overflow-hidden rounded-t-[10px] bg-[#915066] sm:h-[98px] sm:w-[82px] lg:h-[108px] lg:w-[90px]">
          {preacherAvatarUrl ? (
            <img src={preacherAvatarUrl} alt="" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-[24px] font-semibold text-[#F0D9E1] sm:text-[28px]">
              {initials}
            </div>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 bg-white px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#6B2D3E]" aria-hidden />
          <span className="min-w-0 break-words text-xs font-semibold text-stone-500">{dateLabel}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="inline-flex min-h-[28px] min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[#DDE7CD] bg-[#F6FAEF] px-2.5 py-1 text-[11px] font-semibold text-[#48652E] sm:min-h-[30px] sm:px-3 sm:text-xs">
            <LuStar className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{topic}</span>
          </div>
          <a
            href={scriptureUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[28px] min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[#E3D7DB] bg-[#F8F2F4] px-2.5 py-1 text-[11px] font-semibold text-[#6B2D3E] transition hover:bg-[#EFE3E8] sm:min-h-[30px] sm:px-3 sm:text-xs"
          >
            <span className="min-w-0 truncate">{scripture}</span>
            <LuExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        </div>
        {canRate ? (
          <button
            type="button"
            onClick={onOpenComments}
            className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-[#6B2D3E] px-4 text-xs font-extrabold text-white hover:bg-[#5B2332] sm:min-h-[40px] sm:text-sm"
          >
            Оценить и оставить комментарий
          </button>
        ) : null}
      </div>
    </section>
  );
}

function BroadcastCompactCard({
  broadcast,
  timerText,
  uiMode,
  endsAtFormatted,
  viewerCount,
  onOpen,
}: {
  broadcast: BroadcastData | null;
  timerText: string;
  uiMode: BroadcastUiMode;
  endsAtFormatted: string | null;
  viewerCount?: number | null;
  onOpen: () => void;
}) {
  const isOnAir = uiMode === 'onair';
  const title = broadcast?.title?.trim() || 'Трансляция';
  const platform = mapPlatformLabel(broadcast?.platform);
  const timerLabel = isOnAir ? 'Идёт трансляция' : 'До начала';
  const dateLabel = isOnAir ? 'Началась' : 'Начало';
  const description = (broadcast?.description ?? '').trim() || '—';
  const showViewers = isOnAir && typeof viewerCount === 'number' && viewerCount > 0;
  const statusBadge = isOnAir
    ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D64035] px-2 py-0.5 text-[10px] font-bold text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
        В эфире
      </span>
    )
    : <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Скоро</span>;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 items-center gap-3 bg-[#1a1a1a] px-3 py-2.5">
        <div className="grid h-[36px] w-[52px] shrink-0 place-items-center rounded-md bg-[#111] text-white/85">
          <LuPlay className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-bold leading-snug text-white">{title}</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0">{statusBadge}</span>
            <span className="min-w-0 truncate text-[11px] font-medium text-white/70">{platform}</span>
            {showViewers && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                <LuEye className="h-3 w-3 shrink-0" aria-hidden />
                {viewerCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-stone-200" />

      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-semibold ${isOnAir ? 'text-[#D64035]' : 'text-stone-500'}`}>{timerLabel}</p>
          <p
            className={`truncate text-xl font-extrabold tabular-nums ${isOnAir ? 'text-[#D64035]' : 'text-stone-900'}`}
          >
            {timerText}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 min-h-[36px] items-center justify-center rounded-xl bg-[#D64035] px-4 text-sm font-bold text-white hover:bg-[#bc342c]"
        >
          Смотреть
        </button>
      </div>

      <div className="h-px bg-stone-200" />

      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-3 py-2 text-xs max-lg:gap-x-3 lg:flex lg:items-start lg:justify-between lg:gap-3">
        <span className="shrink-0 font-semibold text-stone-500">{dateLabel}</span>
        <span className="min-w-0 truncate text-right font-semibold tabular-nums text-stone-800">
          {formatBroadcastDateTime(broadcast?.starts_at ?? null)}
        </span>
      </div>
      {endsAtFormatted ? (
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-3 pb-1 text-xs max-lg:gap-x-3 lg:flex lg:items-start lg:justify-between lg:gap-3">
          <span className="shrink-0 font-semibold text-stone-500">Окончание</span>
          <span className="min-w-0 truncate text-right font-semibold tabular-nums text-stone-800">{endsAtFormatted}</span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1 px-3 pb-3 pt-0.5 text-xs max-lg:min-w-0 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
        <span className="shrink-0 font-semibold text-stone-500">Описание</span>
        <span className="min-w-0 font-medium text-stone-700 max-lg:truncate lg:max-w-[70%] lg:break-words lg:text-right">
          {description}
        </span>
      </div>
    </section>
  );
}

type DashboardQuickAction = {
  id: string;
  to: string;
  label: string;
  Icon: IconType;
  /** Подложка иконки — мягкий тон, как у карточек дашборда. */
  chipBg: string;
  /** Тонкое внутреннее кольцо вокруг подложки иконки. */
  chipRing: string;
  /** Цвет самой иконки — насыщенный, но не «кричащий». */
  iconColor: string;
  hideForParishioner?: boolean;
};

/**
 * Палитра иконок подобрана под уже существующие карточки дашборда —
 * без кричащих градиентов, в общей сдержанной гамме проекта:
 *  - Расписание → зелёный, как карточка «Событие»;
 *  - Отправить нужду → бордовый primary (#7d3640) — фирменный цвет;
 *  - Проповеди → бирюзовый, как карточка «Медиа».
 */
const DASHBOARD_QUICK_ACTIONS: DashboardQuickAction[] = [
  {
    id: 'schedule',
    to: '/events',
    label: 'Расписание',
    Icon: LuCalendarRange,
    chipBg: 'bg-[#EBF7EF] dark:bg-[#1A9A55]/14',
    chipRing: 'ring-[#1A9A55]/20 dark:ring-[#1A9A55]/30',
    iconColor: 'text-[#0F6636] dark:text-[#5BD18E]',
  },
  {
    id: 'send-need',
    to: '/prayer',
    label: 'Отправить нужду',
    Icon: LuHandHeart,
    chipBg: 'bg-[#F6EBED] dark:bg-[#C0415A]/16',
    chipRing: 'ring-[#7d3640]/18 dark:ring-[#C0415A]/30',
    iconColor: 'text-[#7d3640] dark:text-[#E5879A]',
    hideForParishioner: true,
  },
  {
    id: 'sermons',
    to: '/sermons',
    label: 'Проповеди',
    Icon: LuMic,
    chipBg: 'bg-[#E6F4F1] dark:bg-[#0E7E6A]/16',
    chipRing: 'ring-[#0E7E6A]/20 dark:ring-[#0E7E6A]/30',
    iconColor: 'text-[#0A5A4C] dark:text-[#4FD0B6]',
  },
];

function DashboardQuickActionsStrip({
  isParishionerGuest,
  onNavigate,
}: {
  isParishionerGuest: boolean;
  onNavigate: (to: string) => void;
}) {
  const items = useMemo(
    () =>
      DASHBOARD_QUICK_ACTIONS.filter(
        (action) => !(action.hideForParishioner && isParishionerGuest),
      ),
    [isParishionerGuest],
  );

  if (items.length === 0) return null;

  /**
   * Сетка с равными колонками — кнопки всегда в один ряд.
   * Используем произвольные значения Tailwind (`[grid-template-columns:…]`)
   * вместо `grid-cols-3`, чтобы глобальное мобильное правило
   * `.grid-cols-3 { grid-template-columns: 1fr !important; }` (styles/mobile.css)
   * не схлопывало эти кнопки в столбик на телефонах.
   */
  const gridColsClass =
    items.length === 1
      ? '[grid-template-columns:1fr]'
      : items.length === 2
        ? '[grid-template-columns:repeat(2,minmax(0,1fr))]'
        : '[grid-template-columns:repeat(3,minmax(0,1fr))]';

  return (
    <nav
      aria-label="Быстрые переходы"
      className={[
        'dashboard-quick-actions grid w-full min-w-0 items-stretch gap-1.5 pt-3 pb-1',
        'sm:gap-2.5 sm:pt-4',
        'lg:gap-3',
        gridColsClass,
      ].join(' ')}
    >
      {items.map((action) => {
        const Icon = action.Icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onNavigate(action.to)}
            className={[
              /* База — нейтральная «капсула» под общую палитру проекта */
              'group relative flex w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-full',
              'border border-stone-200/70 bg-[var(--surface-elevated)] text-[var(--text)] max-lg:shadow-none lg:shadow-[var(--shadow-card)]',
              'dark:border-white/[0.08] dark:bg-[var(--surface-elevated)]',
              /* Поведение */
              'transition-[transform,background-color,box-shadow,border-color] duration-200 ease-out tap-highlight-transparent touch-manipulation outline-none',
              'hover:-translate-y-0.5 hover:bg-stone-50 hover:border-stone-300/80',
              'dark:hover:bg-white/[0.04] dark:hover:border-white/[0.12]',
              'focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[color:var(--a11y-focus-ring,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
              'active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
              /* Размер: один ряд на всех ширинах, плотная пилюля на мобильном */
              'min-h-[40px] px-2 py-1.5',
              'sm:min-h-[44px] sm:gap-2.5 sm:px-3.5 sm:py-2',
              'lg:min-h-[48px] lg:gap-3 lg:px-5 lg:py-2.5',
            ].join(' ')}
          >
            <span
              className={[
                'grid shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors',
                'h-6 w-6 sm:h-8 sm:w-8 lg:h-9 lg:w-9',
                action.chipBg,
                action.chipRing,
              ].join(' ')}
            >
              <Icon
                className={[
                  action.iconColor,
                  'h-[13px] w-[13px] sm:h-4 sm:w-4 lg:h-[18px] lg:w-[18px]',
                ].join(' ')}
                strokeWidth={2.25}
                aria-hidden
              />
            </span>
            <span
              className={[
                'min-w-0 max-w-full font-semibold leading-tight tracking-tight',
                /* Мобильный: 11 px, одна строка с многоточием на крайне узких экранах */
                'truncate text-[11px]',
                /* sm+: чуть крупнее */
                'sm:text-[12.5px] sm:leading-none',
                'lg:text-[13.5px]',
              ].join(' ')}
            >
              {action.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function DashboardMain() {
  const qc = useQueryClient();
  const requestOpenCoordinatorNoteEditor = useCoordinatorNoteEditorRequestStore((s) => s.requestOpenEditor);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin';
  const isPastor = role === 'pastor';
  /** Гостевой режим после одобрения заявки с ролью «Прихожанин». */
  const isParishionerGuest = role === 'parishioner';
  const todayDateKey = useMemo(() => formatCalendarDayKey(now), [now]);
  /** Понедельник текущей недели (как на сервере) — чтобы кэш сбрасывался при смене недели. */
  const weekStartKey = useMemo(
    () => formatCalendarDayKey(startOfWeek(now, { weekStartsOn: 1 })),
    [now],
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayDashboardSermonRef = useRef(false);

  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [latestPlaybackPlaying, setLatestPlaybackPlaying] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);
  const [broadcastNowMs, setBroadcastNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setBroadcastNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Сразу после полуночи обновляем «сегодня» (даты дней рождения и др. блоков). */
  useEffect(() => {
    const msUntilMidnight = () => {
      const t = new Date();
      const next = new Date(t);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return Math.max(0, next.getTime() - t.getTime());
    };
    const id = window.setTimeout(() => setNow(new Date()), msUntilMidnight());
    return () => window.clearTimeout(id);
  }, [todayDateKey]);

  useEffect(() => {
    if (!eventOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [eventOpen]);

  useEffect(() => {
    if (!eventOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEventOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eventOpen]);

  const meQ = useMe();
  const rolePermissionsQ = useQuery({
    queryKey: keys.rolePermissionsPublic,
    queryFn: fetchRolePermissionsPublic,
    staleTime: 120_000,
  });

  const profileUsername = useAuthStore((s) => s.username ?? '');
  const profileMemberId = useAuthStore((s) => s.memberId);
  const publicProfileSlug =
    profileUsername.trim() || (profileMemberId != null ? `member-${profileMemberId}` : '');

  const myPublicProfileQ = useQuery({
    queryKey: ['profile', 'dashboard-public', publicProfileSlug],
    queryFn: () => fetchProfileByUsername(publicProfileSlug),
    enabled: publicProfileSlug.length > 0,
    staleTime: 60_000,
  });

  const prayerQ = useQuery({
    queryKey: keys.calendarDay(todayDateKey),
    queryFn: () => getCalendarDay(todayDateKey),
    staleTime: 60_000,
  });

  const broadcastQ = useQuery({
    queryKey: keys.broadcast,
    queryFn: fetchActiveBroadcast,
    staleTime: 60_000,
  });

  const sermonsQ = useQuery({
    queryKey: ['resources', 'podcasts', 'dashboard'],
    queryFn: () => fetchPodcastFeed({ limit: 30 }),
    staleTime: 60_000,
  });

  const eventsQ = useQuery({
    queryKey: keys.events,
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });
  const upcomingPlansQ = useQuery({
    queryKey: ['service-plans', 'dashboard-nearest', todayDateKey],
    queryFn: () => fetchServicePlans({ from: todayDateKey }),
    staleTime: 60_000,
  });
  const birthdaysQ = useQuery({
    queryKey: ['calendar', 'birthdays', 'week', weekStartKey, todayDateKey],
    queryFn: getWeekBirthdays,
    /** Дни рождения зависят от «сегодня» — не держим устаревший список в кэше. */
    staleTime: 0,
    refetchInterval: 60_000,
  });
  const needsNextWeekPlan =
    apiBoolean(meQ.data?.is_collection_coordinator) || isAdmin;
  const needsCurrentWeekPlan = isAdmin;

  const collectionClaimsQ = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims', 'next', 'dashboard'],
    queryFn: () => getCycleCollectionClaims('next'),
    enabled: needsNextWeekPlan,
    staleTime: 30_000,
  });
  const collectionClaimsCurrentQ = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims', 'current', 'dashboard'],
    queryFn: () => getCycleCollectionClaims('current'),
    enabled: needsCurrentWeekPlan,
    staleTime: 30_000,
  });
  const weekMembersQ = useQuery({
    queryKey: ['calendar', 'week-members', 'next', 'dashboard'],
    queryFn: () => getWeekPlanMembers('next'),
    enabled: needsNextWeekPlan,
    staleTime: 30_000,
  });
  const weekMembersCurrentQ = useQuery({
    queryKey: ['calendar', 'week-members', 'current', 'dashboard'],
    queryFn: () => getWeekPlanMembers('current'),
    enabled: needsCurrentWeekPlan,
    staleTime: 30_000,
  });

  const dashboardNotesQ = useQuery({
    queryKey: keys.dashboardNotes(todayDateKey),
    queryFn: () => fetchDashboardCoordinatorNotes(todayDateKey),
    /** Срочные нужды и объявления: сразу подтягивать после WS `coordinator-notes` и при заходе на главную. */
    staleTime: 0,
  });

  const me = meQ.data ?? null;
  const fullName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || me?.name || 'Профиль';
  const pf = myPublicProfileQ.data ?? null;

  const profileDisplayTitle = useMemo(() => {
    if (!pf) return fullName;
    const fromMember = memberNameFirstLast(pf.profile);
    if (fromMember) return fromMember;
    const fromProfile = pf.profile.display_name?.trim();
    if (fromProfile) return fromProfile;
    return fullName || pf.profile.username || 'Профиль';
  }, [pf, fullName]);

  const isPlaceholderUsername = Boolean(
    pf?.profile.username?.trim() && /^member-\d+$/i.test(pf.profile.username.trim()),
  );

  const profileHandleLine = useMemo(() => {
    if (!pf || isPlaceholderUsername) return null;
    const u = pf.profile.username?.trim();
    if (!u) return null;
    const at = `@${u}`;
    const t = profileDisplayTitle.trim();
    if (t.toLowerCase() === at.toLowerCase() || t.toLowerCase() === u.toLowerCase()) return null;
    return at;
  }, [pf, isPlaceholderUsername, profileDisplayTitle]);

  const avatarUrl = resolvePublicUrl(pf?.profile.avatar_url ?? me?.avatar_url ?? null);
  const publicationsCount = pf?.posts?.length ?? 0;
  const publicationsLabel = pluralizeRu(publicationsCount, ['публикация', 'публикации', 'публикаций']);
  const bioText = pf?.profile.bio?.trim() ?? '';
  const hasProfilePostDraft = useProfileDraftStore((s) => s.hasActivePostDraft);

  const memberToday = prayerQ.data?.members?.[0] ?? null;
  const todayLabel = formatTodayLabel(now);

  const activeBroadcast = broadcastQ.data?.broadcast ?? null;
  const broadcastUiMode = getBroadcastUiMode(broadcastNowMs, activeBroadcast);
  const broadcastTimerText = formatBroadcastMainTimer(broadcastNowMs, activeBroadcast);
  const showBroadcastWidget = shouldShowBroadcastWidget(broadcastNowMs, activeBroadcast);
  const broadcastViewerCount = useBroadcastViewers();
  const announcementNote = dashboardNotesQ.data?.announcement ?? null;
  const hasAnnouncement = announcementNote != null;
  const displayAnnouncement = hasAnnouncement && !isParishionerGuest;
  const broadcastEndsLabel = useMemo(() => {
    if (broadcastUiMode !== 'pre' && broadcastUiMode !== 'onair') return null;
    const start = parseBroadcastStartsAt(activeBroadcast?.starts_at ?? null);
    if (!start) return null;
    return format(new Date(start.getTime() + BROADCAST_SLOT_MS), 'dd.MM.yyyy HH:mm');
  }, [activeBroadcast?.starts_at, broadcastUiMode]);

  const latestEpisode = pickLatestEpisode(sermonsQ.data?.episodes ?? []);
  const showDashboardSermonPlayer = Boolean(
    latestEpisode && activeAudioUrl && activeAudioUrl === latestEpisode.audioUrl,
  );
  const sermonFeedTitle = sermonsQ.data?.feed?.title ?? 'Подкаст';
  const event = pickUpcomingEvent(now, eventsQ.data ?? []);
  const nearestPlan = useMemo(
    () => pickNearestPlan(upcomingPlansQ.data ?? [], now),
    [upcomingPlansQ.data, now],
  );
  const nearestPlanDetailsQ = useQuery({
    queryKey: ['service-plan', 'dashboard-nearest', nearestPlan?.plan.id ?? null],
    queryFn: () => fetchServicePlan(nearestPlan!.plan.id),
    enabled: nearestPlan != null,
    staleTime: 60_000,
  });
  const nearestSermonData = useMemo(
    () => extractNearestSermonData(nearestPlanDetailsQ.data ?? null),
    [nearestPlanDetailsQ.data],
  );
  const preacherProfileQ = useQuery({
    queryKey: ['profile', 'dashboard-preacher', nearestSermonData?.preacherMemberId ?? null],
    queryFn: () => fetchProfileByMemberId(nearestSermonData!.preacherMemberId),
    enabled: nearestSermonData != null,
    staleTime: 60_000,
  });
  const preacherAvatarUrl = resolvePublicUrl(preacherProfileQ.data?.profile.avatar_url ?? null);
  const preacherName = useMemo(() => {
    const profile = preacherProfileQ.data?.profile;
    if (!profile) return 'Проповедник';
    const full = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    if (full) return full;
    const display = profile.display_name?.trim();
    if (display) return display;
    return 'Проповедник';
  }, [preacherProfileQ.data?.profile]);
  const nearestSermonDateLabel = useMemo(
    () => (nearestPlan?.startsAt ? format(nearestPlan.startsAt, 'd MMMM yyyy', { locale: ru }) : ''),
    [nearestPlan?.startsAt],
  );
  const canRateSermon = nearestPlan?.phase === 'feedback';
  const showNearestPreacherWidget = nearestSermonData != null && nearestPlan != null;
  const birthdaysThisWeek: BirthdayWeekItem[] = useMemo(() => {
    const items = birthdaysQ.data?.items ?? [];
    const todayStart = startOfDay(now);
    return items.filter((row) => {
      const raw = row.week_date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
      const d = parse(raw, 'yyyy-MM-dd', new Date());
      if (Number.isNaN(d.getTime())) return false;
      return !isBefore(d, todayStart);
    });
  }, [birthdaysQ.data, now]);
  /**
   * Текущая календарная неделя: с сегодняшнего дня — без текста нужды + координатор по закреплениям этой же недели.
   * (Следующая неделя — отдельно: назначения и план в блоке ниже.)
   */
  const unfilledWeekRowsAdmin = useMemo(() => {
    const days = weekMembersCurrentQ.data ?? [];
    const claims = collectionClaimsCurrentQ.data?.members ?? [];
    const claimById = new Map(claims.map((c) => [c.id, c]));
    const rows: Array<{ date: string; member: Member; coordinatorLabel: string }> = [];
    for (const row of days) {
      if (!row.member) continue;
      if (row.date < todayDateKey) continue;
      if ((row.member.prayer_request ?? '').trim().length > 0) continue;
      const c = claimById.get(row.member.id);
      const cb = c?.claimed_by;
      const coordinatorLabel = cb
        ? memberRosterName({
            id: cb.id,
            name: cb.name,
            first_name: cb.first_name,
            last_name: cb.last_name,
          })
        : 'не назначен';
      rows.push({ date: row.date, member: row.member, coordinatorLabel });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [weekMembersCurrentQ.data, collectionClaimsCurrentQ.data?.members, todayDateKey]);

  /** Для админа: только участники цикла (`in_prayer_cycle`), у кого пустая нужда. */
  const adminUnfilledCycleRows = useMemo(
    () => unfilledWeekRowsAdmin.filter((r) => r.member.in_prayer_cycle !== false),
    [unfilledWeekRowsAdmin],
  );

  const adminNextWeekRosterRows = useMemo(() => {
    const days = [...(weekMembersQ.data ?? [])];
    days.sort((a, b) => a.date.localeCompare(b.date));
    return days;
  }, [weekMembersQ.data]);

  const adminNextWeekRosterStats = useMemo(() => {
    let withMember = 0;
    let filled = 0;
    let inCycle = 0;
    for (const row of adminNextWeekRosterRows) {
      const m = row.member;
      if (!m) continue;
      withMember += 1;
      if (m.in_prayer_cycle !== false) inCycle += 1;
      if ((m.prayer_request ?? '').trim().length > 0) filled += 1;
    }
    return { withMember, filled, inCycle };
  }, [adminNextWeekRosterRows]);
  const adminNextWeekProgress = useMemo(() => {
    if (adminNextWeekRosterStats.withMember <= 0) return 0;
    return Math.max(
      0,
      Math.min(100, (adminNextWeekRosterStats.filled / adminNextWeekRosterStats.withMember) * 100),
    );
  }, [adminNextWeekRosterStats]);
  /** Все участники, закреплённые за текущим куратором на следующую неделю. */
  const coordinatorAssignedRows = useMemo(() => {
    const meId = me?.id ?? null;
    if (meId == null) return [];
    const claims = collectionClaimsQ.data?.members ?? [];
    const claimedMemberIds = new Set(
      claims.filter((c) => c.claimed_by?.id === meId).map((c) => c.id),
    );
    const rows = (weekMembersQ.data ?? [])
      .filter((r) => r.member && claimedMemberIds.has(r.member.id))
      .map((r) => ({ date: r.date, member: r.member as Member }));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }, [collectionClaimsQ.data?.members, weekMembersQ.data, me?.id]);

  const coordinatorProgressStats = useMemo(() => {
    if (isAdmin) {
      return {
        total: adminNextWeekRosterStats.withMember,
        filled: adminNextWeekRosterStats.filled,
      };
    }
    const total = coordinatorAssignedRows.length;
    const filled = coordinatorAssignedRows.filter((r) => isPrayerNeedFilled(r.member)).length;
    return { total, filled };
  }, [
    isAdmin,
    adminNextWeekRosterStats.withMember,
    adminNextWeekRosterStats.filled,
    coordinatorAssignedRows,
  ]);

  const isCollectionCoordinator = apiBoolean(me?.is_collection_coordinator);
  const canManageCoordinatorNotes =
    meQ.isSuccess && (isAdmin || isCollectionCoordinator);

  async function onDeleteAnnouncement() {
    if (!window.confirm('Удалить объявление?')) return;
    try {
      await deleteDashboardCoordinatorNote('announcement', todayDateKey);
      void qc.invalidateQueries({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
    } catch {
      /* toast optional */
    }
  }

  const showPrayerPlanOnDashboard = userCanViewNextWeekPrayerPlan(meQ.data, rolePermissionsQ.data);

  const showInitialSkeleton =
    meQ.isPending &&
    prayerQ.isPending &&
    eventsQ.isPending &&
    !meQ.data &&
    !prayerQ.data &&
    !eventsQ.data;

  useEffect(() => {
    if (!showDashboardSermonPlayer) {
      setLatestPlaybackPlaying(false);
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    const sync = () => setLatestPlaybackPlaying(!el.paused);
    sync();
    el.addEventListener('play', sync);
    el.addEventListener('pause', sync);
    el.addEventListener('ended', sync);
    return () => {
      el.removeEventListener('play', sync);
      el.removeEventListener('pause', sync);
      el.removeEventListener('ended', sync);
    };
  }, [showDashboardSermonPlayer]);

  useEffect(() => {
    if (!showDashboardSermonPlayer || !shouldAutoplayDashboardSermonRef.current) return;
    shouldAutoplayDashboardSermonRef.current = false;
    queueMicrotask(() => {
      const el = audioRef.current;
      if (!el) return;
      void el.play().catch(() => {
        /* ignore autoplay / gesture timing */
      });
    });
  }, [showDashboardSermonPlayer]);

  function closeDashboardSermonPlayer() {
    audioRef.current?.pause();
    setActiveAudioUrl(null);
  }

  async function onPlayLatestClick() {
    if (!latestEpisode?.audioUrl) return;
    const same = activeAudioUrl === latestEpisode.audioUrl;
    if (same && audioRef.current) {
      if (audioRef.current.paused) {
        try {
          await audioRef.current.play();
        } catch {
          /* ignore */
        }
      } else {
        audioRef.current.pause();
      }
      return;
    }
    shouldAutoplayDashboardSermonRef.current = true;
    setActiveAudioUrl(latestEpisode.audioUrl);
  }

  const PlayWidgetIcon = showDashboardSermonPlayer && latestPlaybackPlaying ? LuPause : LuPlay;
  const playWidgetLabel = showDashboardSermonPlayer
    ? latestPlaybackPlaying
      ? 'Пауза'
      : 'Продолжить'
    : 'Воспроизвести';

  if (showInitialSkeleton) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dashboard-adaptive flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
      <div className={sectionHeroStickyClassNested}>
        <PageHeader title="Главная" />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 sm:px-4 shell:px-6 md:px-8 xl:px-10 2xl:max-w-[1480px]">
        <div className="dashboard-scroll-pane min-h-0 flex-1 overflow-y-auto [webkit-overflow-scrolling:touch] max-lg:pt-2 max-lg:pb-[calc(3.5rem+0.5rem)] lg:pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
        <DashboardQuickActionsStrip
          isParishionerGuest={isParishionerGuest}
          onNavigate={(to) => navigate(to)}
        />
        <div className="hidden lg:block">
          <div className="grid grid-flow-row-dense grid-cols-12 gap-4 px-0 py-4 xl:gap-5">
            {showNearestPreacherWidget ? (
              <div className="order-1 col-span-5">
                <UpcomingPreacherCard
                  preacherName={preacherName}
                  preacherAvatarUrl={preacherAvatarUrl}
                  topic={nearestSermonData!.topic}
                  scripture={nearestSermonData!.scripture}
                  dateLabel={nearestSermonDateLabel}
                  canRate={canRateSermon}
                  onOpenComments={() => navigate(`/service-plan/sermon-comments/${nearestSermonData!.shareToken}`)}
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() =>
                navigate(
                  publicProfileSlug
                    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
                    : '/profile',
                )
              }
              className={[
                'group order-2 rounded-[14px] border border-[#E8E0DC] bg-white p-0 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]',
                showNearestPreacherWidget ? 'col-span-3' : 'col-span-4',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 p-3 sm:p-[14px]">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-[#E8D8DC] bg-stone-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-stone-500">
                      <LuUser className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-stone-900">{profileDisplayTitle}</p>
                  <span className="mt-1 inline-block rounded-full bg-[#F0ECF9] px-2 py-0.5 text-[11px] font-semibold text-[#6B47B8]">
                    {publicationsCount} {publicationsLabel}
                  </span>
                  <p className="mt-1 truncate text-xs text-stone-500">
                    {bioText || 'Откройте профиль для обновления информации'}
                  </p>
                </div>
              </div>
            </button>

            <section
              className={[
                'order-3 rounded-[14px] border border-[#F9C0D0] bg-gradient-to-br from-[#FFF0F3] to-[#FFE4EC] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]',
                showNearestPreacherWidget ? 'col-span-2' : 'col-span-4',
              ].join(' ')}
            >
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#C23D57]">Дни рождения</p>
              {birthdaysThisWeek[0] ? (
                <div className="mt-3 flex items-start gap-3">
                  <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-[#E8536B] text-white">
                    <span className="text-lg" aria-hidden>🎂</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[#3D1520]">{birthdaysThisWeek[0].name}</p>
                    <p className="mt-1 text-xs text-[#C23D57]">{formatBirthdayChipDate(birthdaysThisWeek[0].week_date)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm font-medium text-[#C23D57]">На этой неделе дней рождения не запланировано.</p>
              )}
            </section>

            {!isParishionerGuest ? (
              <button
                type="button"
                onClick={() => navigate('/prayer')}
                className={[
                  'order-4 rounded-[14px] border border-[#BFC9F7] bg-gradient-to-br from-[#EEF2FF] to-[#E5EAFF] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]',
                  showNearestPreacherWidget ? 'col-span-2' : 'col-span-4',
                ].join(' ')}
              >
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#3042A8]">Молимся сегодня</p>
                <div className="mt-3 flex items-start gap-3">
                  <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-[#4A5FD5] text-white">
                    <LuChurch className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[#1A2560]">{memberToday?.name ?? 'Не назначен'}</p>
                    <p className="mt-1 text-xs text-[#4A5FD5]">{todayLabel}</p>
                  </div>
                </div>
              </button>
            ) : null}

            {displayAnnouncement ? (
              <section className="order-10 col-span-8 rounded-[14px] border border-[#F5D99A] bg-gradient-to-br from-[#FFF8EC] to-[#FEF0D6] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#E8960F] text-white">
                      <LuArrowRight className="h-4 w-4 rotate-45" strokeWidth={2} aria-hidden />
                    </span>
                    <p className="text-[11px] font-semibold tracking-[0.02em] text-[#9A6200]">Объявление</p>
                  </div>
                  {canManageCoordinatorNotes ? (
                    <details className="group relative">
                      <summary className="inline-flex min-h-[28px] min-w-[28px] cursor-pointer list-none items-center justify-center rounded-lg border border-amber-200 bg-white text-sm font-bold text-amber-900 marker:hidden [&::-webkit-details-marker]:hidden">
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-40 space-y-1 rounded-[10px] border border-amber-200 bg-white p-1.5 shadow-lg">
                        <button
                          type="button"
                          className="inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-amber-950 hover:bg-amber-50"
                          onClick={() => requestOpenCoordinatorNoteEditor('announcement')}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-red-800 hover:bg-red-50"
                          onClick={() => void onDeleteAnnouncement()}
                        >
                          Удалить
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
                <p className={announcementExpanded ? 'whitespace-pre-wrap text-[13px] font-semibold leading-[1.55] text-[#3D2800]' : 'line-clamp-3 whitespace-pre-wrap text-[13px] font-semibold leading-[1.55] text-[#3D2800]'}>
                  {announcementNote?.text ?? ''}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[#B87800] hover:underline"
                  onClick={() => setAnnouncementExpanded((v) => !v)}
                >
                  {announcementExpanded ? 'Свернуть' : 'Читать полностью'}
                </button>
              </section>
            ) : null}

            <section
              className={[
                'relative rounded-[14px] border border-stone-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]',
                displayAnnouncement ? 'order-11' : 'order-21',
                displayAnnouncement ? 'col-span-4' : 'col-span-4',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#0E7E6A] text-white">
                  <LuPlay className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0A5A4C]">Медиа</p>
              </div>
              {latestEpisode ? (
                <>
                  <p className="mt-2 line-clamp-2 text-[14px] font-semibold text-stone-900">{latestEpisode.title}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onPlayLatestClick()}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-[9px] bg-[#0E7E6A] px-4 text-[13px] font-semibold text-white hover:bg-[#0C6E5D]"
                      aria-label={playWidgetLabel}
                    >
                      <PlayWidgetIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                      {playWidgetLabel}
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-stone-500">Новая проповедь пока не найдена.</p>
              )}
            </section>

            {showBroadcastWidget ? (
              <div className={displayAnnouncement ? 'order-20 col-span-4' : 'order-22 col-span-4'}>
                <BroadcastCompactCard
                  broadcast={activeBroadcast}
                  timerText={broadcastTimerText}
                  uiMode={broadcastUiMode}
                  endsAtFormatted={broadcastEndsLabel}
                  viewerCount={broadcastViewerCount}
                  onOpen={() => navigate('/broadcast')}
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setEventOpen(true)}
              className={[
                'rounded-[14px] border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]',
                displayAnnouncement ? 'order-21' : 'order-23',
                displayAnnouncement
                  ? (showBroadcastWidget ? 'col-span-8' : 'col-span-12')
                  : (showBroadcastWidget ? 'col-span-4' : 'col-span-8'),
              ].join(' ')}
            >
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">Событие</p>
              <div className="mt-3 flex items-start gap-3">
                <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-[#1A9A55] text-white">
                  <LuCalendarDays className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#0A2E18]">{event.title}</p>
                  <p className="mt-1 text-xs text-[#1A9A55]">{event.whenLabel}</p>
                </div>
              </div>
            </button>

            {showPrayerPlanOnDashboard ? (
              <section className="order-30 col-span-12 rounded-[14px] border border-[#E8E0DC] bg-[#F8F5F3] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(107,45,62,0.1)]">
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">Координаторы</p>
                <div className="mt-3 grid grid-cols-2 gap-[10px] xl:grid-cols-3">
                  <div className="col-span-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-stone-600">
                      <span>Заполнение нужд</span>
                      <span>{coordinatorProgressStats.filled} из {coordinatorProgressStats.total || 0}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[#E8E0DC]">
                      <div
                        className="h-full rounded bg-[#6B2D3E] transition-[width] duration-500 ease-out"
                        style={{
                          width: coordinatorProgressStats.total > 0
                            ? `${(coordinatorProgressStats.filled / coordinatorProgressStats.total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                  </div>

                  {(isAdmin || isPastor ? unfilledWeekRowsAdmin : coordinatorAssignedRows)
                    .slice(0, 6)
                    .map((row) => {
                      const filled = isAdmin || isPastor ? false : isPrayerNeedFilled(row.member);
                      return (
                        <div
                          key={`desk-coordinator-${row.date}-${row.member.id}`}
                          className="flex items-start justify-between gap-2 rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">
                              {memberFirstLastLine(row.member)}
                            </p>
                            <p className="mt-1 text-[11px] text-[#888]">{formatWeekDayChip(row.date)}</p>
                          </div>
                          {isAdmin || isPastor ? null : filled ? (
                            <span
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"
                              title="Нужда заполнена"
                              aria-label="Нужда заполнена"
                            >
                              <LuCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                            </span>
                          ) : (
                            <span
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-100 text-red-700"
                              title="Нужда не заполнена"
                              aria-label="Нужда не заполнена"
                            >
                              <LuMinus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
                <div className="mt-4">
                  {isAdmin ? (
                    <details className="group rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm font-extrabold text-stone-900 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span>Назначения координаторов и правки плана</span>
                        <span className="shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:hidden">
                          Развернуть
                        </span>
                        <span className="hidden shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:inline">
                          Свернуть
                        </span>
                      </summary>
                      <div className="px-2 pb-2 pt-1">
                        <NextWeekPrayerPlanSection
                          canView
                          currentUserId={me?.id ?? null}
                          currentUserRole={me?.app_role ?? null}
                          isAdmin={isAdmin}
                        />
                      </div>
                    </details>
                  ) : (
                    <NextWeekPrayerPlanSection
                      canView
                      currentUserId={me?.id ?? null}
                      currentUserRole={me?.app_role ?? null}
                      isAdmin={isAdmin}
                    />
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="dashboard-grid grid grid-cols-1 gap-3.5 min-[769px]:grid-cols-2 min-[769px]:gap-4 lg:hidden [&>*]:min-w-0 [&>*]:max-lg:w-full">
          {birthdaysThisWeek.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-[#F9C0D0] bg-gradient-to-br from-[#FFF0F3] to-[#FFE4EC] p-4 shadow-[var(--shadow-card)] min-[769px]:col-span-2 sm:p-5">
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#C23D57]">
                Предстоящие дни рождения на этой неделе
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {birthdaysThisWeek.map((row) => (
                  <span
                    key={`${row.id}-${row.week_date}`}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#F9C0D0] bg-white/90 px-3 py-2 text-sm font-bold text-[#3D1520]"
                  >
                    <span aria-hidden>🎉</span>
                    <span>{row.name}</span>
                    <span className="text-[#C23D57]">{formatBirthdayChipDate(row.week_date)}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {showNearestPreacherWidget ? (
            <div className="min-[769px]:col-span-2">
              <UpcomingPreacherCard
                preacherName={preacherName}
                preacherAvatarUrl={preacherAvatarUrl}
                topic={nearestSermonData!.topic}
                scripture={nearestSermonData!.scripture}
                dateLabel={nearestSermonDateLabel}
                canRate={canRateSermon}
                onOpenComments={() => navigate(`/service-plan/sermon-comments/${nearestSermonData!.shareToken}`)}
              />
            </div>
          ) : null}

          <div className="flex min-w-0 w-full flex-col gap-3">
            <button
              type="button"
              onClick={() =>
                navigate(
                  publicProfileSlug
                    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
                    : '/profile',
                )
              }
              className="tap-highlight-transparent touch-manipulation relative w-full overflow-hidden rounded-2xl border border-stone-200/70 bg-white/90 p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:p-4"
            >
              <div className="pointer-events-none absolute right-0 top-0 hidden h-20 w-20 rounded-full bg-primary/[0.06] blur-2xl lg:block" />
              <div className="relative flex flex-col gap-3">
                <div className="flex min-h-[1.25rem] items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">Мой профиль</p>
                  {hasProfilePostDraft ? (
                    <span
                      className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-[0.02em] text-amber-900"
                      title="Есть черновик поста на странице"
                    >
                      Черновик
                    </span>
                  ) : null}
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200/70">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-stone-500">
                        <LuUser className="h-5 w-5" strokeWidth={2} aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-[15px] font-bold leading-snug text-stone-900">{profileDisplayTitle}</p>
                    {profileHandleLine ? (
                      <p className="truncate text-xs font-medium text-stone-500">{profileHandleLine}</p>
                    ) : null}
                    <div className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-stone-100/90 px-2 py-1 text-[11px] font-bold text-stone-700">
                      <span className="tabular-nums text-stone-900">{publicationsCount}</span>
                      <span>{publicationsLabel}</span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-snug text-stone-600 sm:text-sm">
                      {bioText || 'Откройте страницу, чтобы заполнить описание.'}
                    </p>
                  </div>
                </div>
              </div>
            </button>
            {displayAnnouncement && dashboardNotesQ.data?.announcement ? (
              <section
                aria-label="Объявление"
                className="overflow-hidden rounded-2xl border border-[#F5D99A] bg-gradient-to-br from-[#FFF8EC] to-[#FEF0D6] p-4 shadow-[var(--shadow-card)]"
              >
                {canManageCoordinatorNotes ? (
                  <div className="mb-3 flex justify-end">
                    <details className="group relative">
                      <summary className="tap-highlight-transparent inline-flex min-h-[36px] min-w-[36px] cursor-pointer list-none items-center justify-center rounded-[10px] border border-amber-300/80 bg-white/90 px-2.5 text-base font-extrabold text-amber-950 hover:bg-amber-50 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span aria-hidden>⋯</span>
                        <span className="sr-only">Действия с объявлением</span>
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-40 space-y-1 rounded-[10px] border border-amber-200 bg-white p-1.5 shadow-lg">
                        <button
                          type="button"
                          className="tap-highlight-transparent inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-amber-950 hover:bg-amber-50"
                          onClick={() => requestOpenCoordinatorNoteEditor('announcement')}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="tap-highlight-transparent inline-flex min-h-[34px] w-full items-center justify-start rounded-lg px-2.5 text-xs font-extrabold text-red-800 hover:bg-red-50"
                          onClick={() => void onDeleteAnnouncement()}
                        >
                          Удалить
                        </button>
                      </div>
                    </details>
                  </div>
                ) : null}
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#9A6200]">Объявление</p>
                <p
                  className={[
                    'announcement-text mt-2 whitespace-pre-wrap text-sm font-semibold leading-[1.55] text-[#3D2800]',
                    announcementExpanded ? 'announcement-text--expanded' : '',
                  ].join(' ')}
                >
                  {announcementNote?.text ?? ''}
                </p>
                <button
                  type="button"
                  className="announcement-expand-btn mt-2 hidden text-sm font-bold text-[#B87800] underline underline-offset-2"
                  onClick={() => setAnnouncementExpanded((v) => !v)}
                >
                  {announcementExpanded ? 'Свернуть' : 'Читать полностью'}
                </button>
              </section>
            ) : null}
          </div>

          {!isParishionerGuest ? (
            <button
              type="button"
              onClick={() => navigate('/prayer')}
              className="tap-highlight-transparent touch-manipulation group min-h-[146px] overflow-hidden rounded-2xl border border-[#BFC9F7] bg-gradient-to-br from-[#EEF2FF] to-[#E5EAFF] p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] sm:min-h-[152px] sm:p-5 min-[769px]:col-span-2"
            >
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#3042A8]">Молимся сегодня</p>
              <div className="mt-4 flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#4A5FD5] text-white">
                  <LuChurch className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-[#1A2560]">{todayLabel}</p>
                  <p className="mt-1 text-sm font-semibold text-[#4A5FD5]">
                    {memberToday ? `Молимся за ${memberToday.name}` : 'Сегодня в цикле участник не назначен'}
                  </p>
                </div>
              </div>
            </button>
          ) : null}

          {showBroadcastWidget ? (
            <div className="min-[769px]:col-span-2">
              <BroadcastCompactCard
                broadcast={activeBroadcast}
                timerText={broadcastTimerText}
                uiMode={broadcastUiMode}
                endsAtFormatted={broadcastEndsLabel}
                viewerCount={broadcastViewerCount}
                onOpen={() => navigate('/broadcast')}
              />
            </div>
          ) : null}

          <section className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[var(--shadow-card)] min-[769px]:col-span-2 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0E7E6A] text-white">
                <LuPlay className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0E7E6A]">Медиа</p>
            </div>

            {latestEpisode ? (
              <div className="mt-4 min-w-0">
                <p className="min-w-0 text-base font-extrabold text-stone-900 max-lg:truncate lg:line-clamp-2">
                  {latestEpisode.title}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onPlayLatestClick()}
                    className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#0E7E6A] px-4 text-sm font-extrabold text-white hover:bg-[#0C6E5D] sm:w-auto"
                    aria-label={playWidgetLabel}
                  >
                    <PlayWidgetIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    {playWidgetLabel}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold text-stone-500">Новая проповедь пока не найдена.</p>
            )}
          </section>

          <button
            type="button"
            onClick={() => setEventOpen(true)}
            className="tap-highlight-transparent touch-manipulation group min-h-[132px] overflow-hidden rounded-2xl border border-[#A8E4C0] bg-gradient-to-br from-[#EDFBF3] to-[#D9F5E6] p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)] min-[769px]:col-span-2 sm:min-h-[140px] sm:p-5"
          >
            <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">События</p>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1A9A55] text-white">
                <LuCalendarDays className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-[#0A2E18]">{event.title}</p>
                <p className="mt-1 text-sm font-semibold text-[#1A9A55]">{event.whenLabel}</p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-[#2F6D49]">Нажмите, чтобы открыть описание события.</p>
              </div>
            </div>
          </button>

          {showPrayerPlanOnDashboard ? (
            <section className="rounded-2xl border border-[#E8E0DC] bg-[#F8F5F3] p-4 shadow-[var(--shadow-card)] min-[769px]:col-span-2">
              <p className="text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">
                Координаторам сбора
              </p>
              {isAdmin ? (
                <>
                  {(() => {
                    const leaderUnfilledRows = adminUnfilledCycleRows;
                    return leaderUnfilledRows.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-sm font-semibold text-stone-800">
                          На текущей неделе не заполнена молитвенная нужда (только участники цикла):
                        </p>
                        <ul className="mt-2 max-h-[min(40dvh,320px)] space-y-2 overflow-y-auto pr-0.5">
                          {leaderUnfilledRows.map((row) => (
                            <li
                              key={`${row.date}-${row.member.id}`}
                            className="flex flex-col gap-0.5 rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                            >
                              <span className="font-bold text-stone-900">{memberFirstLastLine(row.member)}</span>
                              <span className="text-xs font-semibold text-stone-500">{formatWeekDayChip(row.date)}</span>
                              <span className="text-xs text-stone-600 sm:text-right">
                                Координатор: <span className="font-semibold text-stone-800">{row.coordinatorLabel}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-stone-600">
                        На текущей неделе у всех участников цикла нужды заполнены.
                      </p>
                    );
                  })()}

                  <details className="group mt-4 rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm font-extrabold text-stone-900 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        Список на следующую неделю
                        <span className="mt-0.5 block text-xs font-semibold text-stone-500">
                          {weekMembersQ.isFetching && !weekMembersQ.data
                            ? 'Загружаем…'
                            : adminNextWeekRosterStats.withMember > 0
                              ? `${adminNextWeekRosterStats.filled} из ${adminNextWeekRosterStats.withMember} заполнено`
                              : 'пока нет данных'}
                        </span>
                        {adminNextWeekRosterStats.withMember > 0 ? (
                          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded bg-[#E8E0DC]">
                            <span
                              className="block h-full rounded bg-[#6B2D3E] transition-[width] duration-300 ease-out"
                              style={{ width: `${adminNextWeekProgress}%` }}
                            />
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:hidden">
                        Показать
                      </span>
                      <span className="hidden shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:inline">
                        Скрыть
                      </span>
                    </summary>
                    <div className="px-2 pb-2 pt-1">
                      {weekMembersQ.isError ? (
                        <p className="text-sm text-red-700">Не удалось загрузить план недели. Обновите страницу.</p>
                      ) : adminNextWeekRosterRows.length === 0 ? (
                        <p className="text-sm text-stone-600">Пока нет строк плана на следующую неделю.</p>
                      ) : (
                        <ul className="max-h-[min(52dvh,520px)] space-y-2 overflow-y-auto pr-0.5">
                          {adminNextWeekRosterRows.map((row) => {
                            const m = row.member;
                            const need = (m?.prayer_request ?? '').trim();
                            const filled = need.length > 0;
                            const inCycle = m ? m.in_prayer_cycle !== false : false;
                            return (
                              <li
                                key={`roster-${row.date}-${m?.id ?? 'none'}`}
                                className="rounded-[10px] border border-stone-200/70 bg-white/85 px-3 py-2 text-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-stone-900">
                                      {m ? memberFirstLastLine(m) : '—'}
                                    </p>
                                    <p className="mt-0.5 text-xs font-semibold text-stone-500">{formatWeekDayChip(row.date)}</p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[11px] font-bold tracking-[0.02em] text-stone-500">
                                      {m ? (inCycle ? 'в цикле' : 'вне цикла') : '—'}
                                    </p>
                                    <p
                                      className={`mt-1 text-[11px] font-bold tracking-[0.02em] ${
                                        filled ? 'text-emerald-700' : 'text-amber-800'
                                      }`}
                                    >
                                      {filled ? 'нужда есть' : 'нужды нет'}
                                    </p>
                                  </div>
                                </div>
                                {filled ? (
                                  <p className="mt-2 text-xs font-medium leading-snug text-stone-700">
                                    {truncatePrayerNeedPreview(need, 140)}
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </details>
                </>
              ) : (
                <div className="mt-3">
                  {coordinatorAssignedRows.length > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-stone-800">
                        Ваши участники на следующую неделю:
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {coordinatorAssignedRows.map((row) => {
                          const filled = isPrayerNeedFilled(row.member);
                          return (
                            <li
                              key={`assigned-${row.date}-${row.member.id}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#E8E0DC] bg-white px-3 py-2 text-sm"
                            >
                              <span className="font-bold text-stone-900">{memberFirstLastLine(row.member)}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-stone-600">{formatWeekDayChip(row.date)}</span>
                                {filled ? (
                                  <span
                                    className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700"
                                    title="Нужда заполнена"
                                    aria-label="Нужда заполнена"
                                  >
                                    <LuCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                                  </span>
                                ) : (
                                  <span
                                    className="grid h-6 w-6 place-items-center rounded-full bg-red-100 text-red-700"
                                    title="Нужда не заполнена"
                                    aria-label="Нужда не заполнена"
                                  >
                                    <LuMinus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-stone-600">
                      На следующую неделю за вами пока нет закреплённых участников.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate('/prayer')}
                    className="tap-highlight-transparent mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-white shadow-sm hover:bg-primary/90"
                  >
                    Заполнить в «Молитва»
                    <LuArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              )}
              {isAdmin ? (
                <details className="group mt-4 rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm font-extrabold text-stone-900 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span>Назначения координаторов и правки плана</span>
                    <span className="shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:hidden">
                      Развернуть
                    </span>
                    <span className="hidden shrink-0 rounded-full border border-stone-200/80 bg-white px-2 py-1 text-[11px] font-bold tracking-[0.02em] text-stone-600 group-open:inline">
                      Свернуть
                    </span>
                  </summary>
                  <div className="px-2 pb-2 pt-1">
                    <NextWeekPrayerPlanSection
                      canView
                      currentUserId={me?.id ?? null}
                      currentUserRole={me?.app_role ?? null}
                      isAdmin={isAdmin}
                    />
                  </div>
                </details>
              ) : (
                <div className="mt-4">
                  <NextWeekPrayerPlanSection
                    canView
                    currentUserId={me?.id ?? null}
                    currentUserRole={me?.app_role ?? null}
                    isAdmin={isAdmin}
                  />
                </div>
              )}
            </section>
          ) : null}
        </div>
        </div>
      </div>

      {showDashboardSermonPlayer && latestEpisode ? (
        <div className="fixed inset-x-3 bottom-[calc(var(--app-bottom-nav-total-height)+0.5rem)] z-[60] lg:inset-x-6 lg:bottom-6">
          <div className="rounded-3xl border border-stone-200/80 bg-white/90 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70">
                {latestEpisode.imageUrl ? (
                  <img src={latestEpisode.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-stone-400">
                    <LuHeadphones className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-extrabold text-stone-900">{latestEpisode.title}</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-500">
                  {dashboardEpisodeSubtitle(latestEpisode) || sermonFeedTitle}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
                onClick={() => closeDashboardSermonPlayer()}
                aria-label="Закрыть плеер"
              >
                <LuX className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="mt-3">
              <audio
                ref={(el) => {
                  audioRef.current = el;
                }}
                controls
                preload="none"
                className="w-full"
                src={latestEpisode.audioUrl}
              />
            </div>
          </div>
        </div>
      ) : null}

      {eventOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="dashboard-backdrop fixed inset-0 z-[150] flex min-h-screen items-center justify-center bg-black/45 p-4 [padding-left:max(0.75rem,env(safe-area-inset-left,0px))] [padding-right:max(0.75rem,env(safe-area-inset-right,0px))]"
              onClick={() => setEventOpen(false)}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="dashboard-sheet w-full max-w-lg max-h-[min(82dvh,700px)] overflow-y-auto rounded-2xl border border-stone-200/80 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_24px_70px_rgba(0,0,0,0.2)] [webkit-overflow-scrolling:touch] sm:max-h-[88dvh] sm:p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[11px] font-semibold tracking-[0.02em] text-[#0F6636]">Описание события</p>
                <h2 className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">{event.title}</h2>
                <p className="mt-1 text-sm font-semibold text-primary">{event.whenLabel}</p>
                {event.posterUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-stone-50">
                    <img
                      src={event.posterUrl}
                      alt=""
                      className="h-[200px] w-full object-cover sm:h-[260px]"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                <p className="mt-3 text-sm font-medium leading-relaxed text-stone-700">{event.description}</p>
                <div className="mt-5 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setEventOpen(false)}
                    className="tap-highlight-transparent touch-manipulation inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function DashboardPage() {
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  const firstName = useAuthStore((s) => s.firstName);

  if (registrationStatus === 'pending_review' || registrationStatus === 'rejected') {
    return (
      <LimitedRegistrationDashboard registrationStatus={registrationStatus} firstName={firstName} />
    );
  }

  return <DashboardMain />;
}
