import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { IconType } from 'react-icons';
import {
  LuBookMarked,
  LuBookOpen,
  LuCalendarDays,
  LuCalendarRange,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuChurch,
  LuCloudOff,
  LuHammer,
  LuHandHeart,
  LuHeartHandshake,
  LuRefreshCw,
  LuUserX,
} from 'react-icons/lu';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { DayPicker } from 'react-day-picker';

import {
  getApiBaseUrlFromEnv,
  isApiUrlProbablyWrongForWeb,
  resolveAxiosBaseURL,
} from '../../../lib/config';
import { memberRosterName } from '../../../lib/memberRosterName';
import type { Backslider, DayPrayerData, GlobalTheme, Member, Ministry } from '../../../types';
import { fetchMe, patchProfile } from '../../profile/api';
import { NextWeekPrayerPlanSection, userCanViewNextWeekPrayerPlan } from '../components/NextWeekPrayerPlanSection';
import { formatCalendarDayKey, getCalendarDay } from '../api';
import { loadErrorDescription } from '../prayerPageUtils';

import 'react-day-picker/style.css';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isDayPrayerEmpty(data: DayPrayerData): boolean {
  return (
    data.members.length === 0 &&
    data.global_themes.length === 0 &&
    data.ministries.length === 0 &&
    data.backsliders.length === 0
  );
}

function hasPrayerContent(data: DayPrayerData | null | undefined): data is DayPrayerData {
  return data != null && !isDayPrayerEmpty(data);
}

function SectionHeader({
  Icon,
  title,
  id,
  subtitle,
  titleClassName,
}: {
  Icon: IconType;
  title: string;
  id?: string;
  subtitle?: string;
  titleClassName?: string;
}) {
  return (
    <div className="mb-4 mt-2 pl-1 pr-1 shell:pr-2 animate-prayer-fade-up motion-reduce:animate-none">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[var(--surface-elevated)] to-primary/[0.04] text-primary shadow-sm ring-1 ring-primary/20"
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id={id}
            className={
              titleClassName ??
              'text-[16px] font-extrabold tracking-tight text-stone-900'
            }
          >
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-stone-500">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PrayerCard(props: {
  Icon: IconType;
  title: string;
  accentVar: string;
  children: ReactNode;
  cardIndex?: number;
}) {
  const { Icon, title, accentVar, children, cardIndex = 0 } = props;
  const staggerMs = Math.min(cardIndex * 48, 320);
  return (
    <article
      className="group relative mb-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] transition-[box-shadow,transform,border-color] duration-300 ease-out animate-prayer-fade-up hover:-translate-y-0.5 hover:border-stone-300/85 hover:shadow-lg motion-reduce:animate-none motion-reduce:transform-none motion-reduce:transition-none md:border-stone-200/80 md:shadow-[var(--shadow)]"
      style={{
        ['--card-accent' as string]: accentVar,
        animationDelay: `${staggerMs}ms`,
      }}
    >
      <div
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-2xl bg-[var(--card-accent)] opacity-90 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />
      <div className="border-b border-stone-100/90 px-4 pb-0 pt-[18px] shell:px-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--card-accent)] transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
            style={{ backgroundColor: `color-mix(in srgb, ${accentVar} 12%, transparent)` }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <h3 className="min-w-0 flex-1 pb-1 text-[17px] font-bold leading-snug tracking-tight text-stone-900 shell:text-[18px]">
            {title}
          </h3>
        </div>
      </div>
      <div className="px-4 py-4 text-[15px] leading-relaxed text-stone-600 shell:px-5 shell:pb-5 [&_p]:whitespace-pre-wrap">
        {children}
      </div>
    </article>
  );
}

function MemberCard({
  member,
  currentUserId,
  onPrayerSaved,
  cardIndex = 0,
}: {
  member: Member;
  currentUserId: number | null;
  onPrayerSaved: () => void;
  cardIndex?: number;
}) {
  const isMe = currentUserId != null && member.id === currentUserId;
  const [editText, setEditText] = useState(member.prayer_request ?? '');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    setEditText(member.prayer_request ?? '');
  }, [member.id, member.prayer_request]);

  async function savePrayer() {
    setSaving(true);
    setSaveErr(null);
    try {
      await patchProfile({ prayer_request: editText });
      onPrayerSaved();
    } catch (e) {
      setSaveErr(loadErrorDescription(e) ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  const hasRequest = member.prayer_request != null && member.prayer_request.trim().length > 0;

  return (
    <PrayerCard
      Icon={LuHeartHandshake}
      title={memberRosterName(member)}
      accentVar="var(--member)"
      cardIndex={cardIndex}
    >
      {isMe ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">
              Ваша молитвенная нужда
            </span>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={5}
              maxLength={8000}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] text-stone-800 outline-none transition-shadow duration-200 ring-primary/15 focus:border-primary focus:ring-2 focus:ring-primary/25"
              placeholder="О чём просим молиться…"
            />
          </label>
          {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void savePrayer()}
            className="min-h-[44px] rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      ) : hasRequest ? (
        <p className="text-[16px] text-stone-600">{member.prayer_request}</p>
      ) : (
        <p className="italic text-stone-400">Нет указанных нужд</p>
      )}
    </PrayerCard>
  );
}

function GlobalThemeCard({ theme, cardIndex = 0 }: { theme: GlobalTheme; cardIndex?: number }) {
  const hasVerse = theme.bible_verse != null && theme.bible_verse.trim().length > 0;
  const hasPoints = theme.prayer_points != null && theme.prayer_points.trim().length > 0;
  const hasNothing = !hasVerse && !hasPoints;
  return (
    <PrayerCard Icon={LuBookOpen} title={theme.title} accentVar="var(--theme)" cardIndex={cardIndex}>
      {hasVerse ? (
        <div className="mb-3 rounded-xl border border-[color-mix(in_srgb,var(--theme)_18%,transparent)] bg-[color-mix(in_srgb,var(--theme)_8%,transparent)] px-3.5 py-3.5">
          <div className="flex gap-2.5">
            <LuBookMarked className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--theme)]" aria-hidden />
            <p className="text-[15px] italic leading-relaxed text-stone-600 whitespace-pre-wrap">{theme.bible_verse}</p>
          </div>
        </div>
      ) : null}
      {hasPoints ? <p className="text-[16px] leading-relaxed text-stone-600 whitespace-pre-wrap">{theme.prayer_points}</p> : null}
      {hasNothing ? <p className="italic text-stone-400">Нет дополнительной информации</p> : null}
    </PrayerCard>
  );
}

function MinistryCard({ ministry, cardIndex = 0 }: { ministry: Ministry; cardIndex?: number }) {
  const hasPoints = ministry.prayer_points != null && ministry.prayer_points.trim().length > 0;
  return (
    <PrayerCard Icon={LuHammer} title={ministry.title} accentVar="var(--ministry)" cardIndex={cardIndex}>
      {hasPoints ? (
        <p className="text-[16px] leading-relaxed text-stone-600 whitespace-pre-wrap">{ministry.prayer_points}</p>
      ) : (
        <p className="italic text-stone-400">Нет указанных пунктов молитвы</p>
      )}
    </PrayerCard>
  );
}

function BacksliderCard({ b, cardIndex = 0 }: { b: Backslider; cardIndex?: number }) {
  return (
    <PrayerCard Icon={LuUserX} title={b.name} accentVar="var(--backslider)" cardIndex={cardIndex}>
      <p className="italic text-stone-500">Отпавший — нуждается в молитве о возвращении</p>
    </PrayerCard>
  );
}

function CalendarPrayerSkeleton() {
  return (
    <div
      className="space-y-4 py-2"
      aria-busy="true"
      aria-live="polite"
      aria-label="Загрузка данных молитв"
    >
      <div className="h-4 w-36 animate-pulse rounded-lg bg-stone-200/90" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-stone-100 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] animate-prayer-fade-in motion-reduce:animate-none"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex gap-3">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-stone-200/90" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-5 max-w-[85%] animate-pulse rounded-md bg-stone-200/90" />
              <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
              <div className="h-3 w-[92%] animate-pulse rounded bg-stone-100" />
              <div className="h-3 w-[70%] animate-pulse rounded bg-stone-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBlock(props: { err: unknown; onRetry: () => void }) {
  const detail = loadErrorDescription(props.err);
  const apiLine = `${resolveAxiosBaseURL() || window.location.origin}/api/calendar/…`;
  const wrong = isApiUrlProbablyWrongForWeb();
  const envHint = getApiBaseUrlFromEnv() || '(пусто — используется origin страницы)';

  return (
    <div className="mx-auto max-w-md px-2 py-6 text-center sm:px-6">
      <div
        role="alert"
        className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-red-950 shadow-sm"
      >
        <p className="text-sm font-extrabold uppercase tracking-wide text-red-800">Ошибка запроса</p>
        <p className="mt-1 text-sm font-medium text-red-900">
          Бэкенд не ответил или вернул ошибку. Проверьте, что API сервер запущен и совпадает с прокси Vite.
        </p>
      </div>
      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
        <LuCloudOff className="h-10 w-10" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-stone-900">Не удалось загрузить данные</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-500">
        Проверьте подключение к интернету и что бэкенд доступен по HTTPS.
      </p>
      {detail ? <p className="mt-4 text-[13px] leading-relaxed text-stone-600">{detail}</p> : null}
      <p className="mt-2 text-xs leading-relaxed text-stone-400">
        VITE_API_BASE_URL: {envHint}
        <br />
        Запрос: {apiLine}
      </p>
      {wrong ? (
        <p className="mt-3 text-[13px] font-semibold leading-relaxed text-primary">
          Похоже, в сборке указан localhost вместо публичного API. Задайте VITE_API_BASE_URL и пересоберите.
        </p>
      ) : null}
      <button
        type="button"
        onClick={props.onRetry}
        className="mt-6 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[15px] font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark"
      >
        <LuRefreshCw className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        Повторить
      </button>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center animate-prayer-fade-up motion-reduce:animate-none">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/12 to-primary/6 text-primary shadow-[0_8px_32px_rgba(125,54,64,0.12)] ring-1 ring-primary/10">
        <LuHeartHandshake className="h-14 w-14" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-stone-900">Нет данных на эту дату</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-500">
        Выберите другую дату в календаре выше — появятся темы и нужды.
      </p>
    </div>
  );
}

const CAL_START = new Date(2020, 0, 1);
const CAL_END = new Date(2030, 11, 31);

const WEEKDAY_LABELS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

function WeekStripPicker(props: {
  selected: Date;
  onSelect: (d: Date) => void;
  minDate: Date;
  maxDate: Date;
}) {
  const { selected, onSelect, minDate, maxDate } = props;
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const minWeekStart = startOfWeek(minDate, { weekStartsOn: 1 });
  const maxWeekStart = startOfWeek(maxDate, { weekStartsOn: 1 });
  const canPrev = weekStart.getTime() > minWeekStart.getTime();
  const canNext = weekStart.getTime() < maxWeekStart.getTime();

  function goWeek(delta: number) {
    const next = addWeeks(selected, delta);
    const ws = startOfWeek(next, { weekStartsOn: 1 });
    if (ws.getTime() < minWeekStart.getTime()) {
      onSelect(minDate);
      return;
    }
    if (ws.getTime() > maxWeekStart.getTime()) {
      onSelect(maxDate);
      return;
    }
    onSelect(next);
  }

  const today = new Date();

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => goWeek(-1)}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          aria-label="Предыдущая неделя"
        >
          <LuChevronLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <p className="min-w-0 flex-1 text-center text-[15px] font-semibold capitalize text-stone-900 shell:text-[17px]">
          {format(weekStart, 'LLLL yyyy', { locale: ru })}
        </p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => goWeek(1)}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          aria-label="Следующая неделя"
        >
          <LuChevronRight className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>
      <div className="mb-1.5 grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold text-stone-500 shell:text-xs">
        {WEEKDAY_LABELS_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const isSel = isSameDay(d, selected);
          const isTodayCell = isSameDay(d, today);
          const outOfRange =
            isBefore(startOfDay(d), startOfDay(minDate)) || isAfter(startOfDay(d), startOfDay(maxDate));
          return (
            <button
              key={d.getTime()}
              type="button"
              disabled={outOfRange}
              onClick={() => onSelect(d)}
              className={[
                'flex min-h-[44px] w-full items-center justify-center rounded-full text-[13px] font-medium transition-colors duration-200 sm:text-sm shell:h-11 shell:text-[15px]',
                outOfRange ? 'cursor-not-allowed opacity-30' : '',
                isSel
                  ? 'bg-primary font-semibold text-white shadow-sm shadow-primary/25 hover:bg-primary'
                  : isTodayCell
                    ? 'font-bold text-primary hover:bg-stone-100'
                    : 'text-stone-800 hover:bg-stone-100',
              ].join(' ')}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DailyPrayerPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    staleTime: 60_000,
  });

  const sectionMemberId = useId();
  const sectionBacksliderId = useId();
  const themesMinistriesRegionId = useId();

  const dateKey = formatCalendarDayKey(selected);

  const {
    data,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['calendar', 'day', dateKey],
    queryFn: () => getCalendarDay(dateKey),
  });

  const today = new Date();
  const chipLabel = format(selected, 'd MMMM yyyy', { locale: ru });
  const isToday = isSameDay(selected, today);
  const hasThemesOrMinistries =
    data != null && (data.global_themes.length > 0 || data.ministries.length > 0);

  return (
    <div className="prayer-page-bg min-h-full pb-6 shell:pb-8">
      <div className="sticky top-0 z-40 pb-2 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80">
      <header className="relative overflow-hidden bg-gradient-to-br from-primary via-[#6d3039] to-primary-dark px-4 py-4 text-white shadow-[0_8px_32px_rgba(92,40,48,0.35)] sm:px-5 sm:py-5 md:px-6 md:py-5 shell:rounded-none">
        <div
          className="pointer-events-none absolute -right-4 -top-20 h-48 w-48 rounded-full bg-white/[0.13] blur-3xl animate-prayer-header-breathe motion-reduce:animate-none"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-black/18 blur-2xl"
          aria-hidden
        />
        <h1 className="relative text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-[26px] animate-prayer-fade-up motion-reduce:animate-none">
          Молитва
        </h1>
      </header>

      {/* Чип даты */}
      <div className="px-4 pt-3 shell:px-6">
        <button
          type="button"
          onClick={() => setCalendarExpanded((e) => !e)}
          className="group flex min-h-[48px] w-full items-center gap-3 rounded-full border border-stone-200/60 bg-[var(--surface-elevated)] px-4 py-3 text-left shadow-[var(--shadow)] transition-all duration-200 hover:border-stone-300/80 hover:bg-stone-50/90 active:scale-[0.99] sm:min-h-[52px] motion-reduce:active:scale-100 animate-prayer-fade-in motion-reduce:animate-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-200 group-hover:scale-105 group-hover:bg-primary/[0.14] group-hover:text-primary-dark motion-reduce:group-hover:scale-100">
            <LuCalendarDays className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-stone-900 shell:text-base">{chipLabel}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-[var(--accent)]">
              СЕГОДНЯ
            </span>
          ) : null}
          <LuChevronDown
            className={`h-6 w-6 shrink-0 text-stone-400 transition-transform duration-200 ${calendarExpanded ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {!isPending && isFetching ? (
          <p className="mt-2 flex items-center justify-center gap-2 text-center text-[12px] font-semibold text-primary">
            <LuRefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
            Обновляем данные…
          </p>
        ) : null}
      </div>

      {/* Раскрывающийся календарь */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${calendarExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="mx-4 mt-3 rounded-b-3xl border border-t-0 border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-5 shadow-[var(--shadow)] shell:mx-6">
            {calendarView === 'week' ? (
              <WeekStripPicker
                selected={selected}
                minDate={CAL_START}
                maxDate={CAL_END}
                onSelect={(d) => {
                  setSelected(d);
                  setCalendarExpanded(false);
                }}
              />
            ) : (
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={(d) => {
                  if (d) {
                    setSelected(d);
                    setCalendarExpanded(false);
                  }
                }}
                locale={ru}
                startMonth={CAL_START}
                endMonth={CAL_END}
                defaultMonth={selected}
                showOutsideDays={false}
                className="mx-auto [--rdp-accent-color:var(--primary)] [--rdp-background-color:var(--surface-elevated)]"
                classNames={{
                  root: 'rdp-root relative gap-3',
                  month_caption: 'flex justify-center px-1 pb-2 text-[16px] font-semibold text-stone-900',
                  nav: 'absolute right-0 top-0 flex gap-1',
                  month_grid: 'w-full border-collapse',
                  weekdays: 'text-[11px] font-semibold text-stone-500 shell:text-xs',
                  day: 'p-0.5 text-center',
                  day_button:
                    'flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full text-[13px] font-medium text-stone-800 hover:bg-stone-100 sm:h-10 sm:min-h-[44px] sm:w-10 sm:min-w-[44px] shell:text-[15px]',
                  selected: 'bg-primary font-semibold text-white hover:bg-primary hover:text-white',
                  today: 'font-bold text-primary',
                }}
              />
            )}
            <div className="mt-3 flex items-stretch gap-2 border-t border-stone-100 pt-3">
              <button
                type="button"
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold text-primary hover:bg-primary/[0.06]"
                onClick={() => setCalendarView((v) => (v === 'month' ? 'week' : 'month'))}
              >
                {calendarView === 'month' ? (
                  <>
                    <LuCalendarRange className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                    Неделя
                  </>
                ) : (
                  <>
                    <LuCalendarDays className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                    Весь месяц
                  </>
                )}
              </button>
              <button
                type="button"
                className="flex h-auto min-h-[48px] w-12 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
                onClick={() => setCalendarExpanded(false)}
                aria-label="Свернуть календарь"
              >
                <LuChevronUp className="h-7 w-7" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="px-4 pt-4 shell:px-6">
        {userCanViewNextWeekPrayerPlan(me) ? (
          <NextWeekPrayerPlanSection canView currentUserId={me?.id ?? null} />
        ) : null}
        {isPending ? (
          <CalendarPrayerSkeleton />
        ) : isError ? (
          <ErrorBlock err={queryError} onRetry={() => void refetch()} />
        ) : hasPrayerContent(data) ? (
          <div className="pb-6">
            {data.members.length > 0 ? (
              <section aria-labelledby={sectionMemberId}>
                <SectionHeader
                  Icon={LuChurch}
                  title="Сегодня молимся за члена церкви"
                  id={sectionMemberId}
                />
                {data.members.map((m, i) => (
                  <MemberCard
                    key={m.id}
                    cardIndex={i}
                    member={m}
                    currentUserId={me?.id ?? null}
                    onPrayerSaved={() => {
                      void qc.invalidateQueries({ queryKey: ['calendar', 'day', dateKey] });
                      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
                      void qc.invalidateQueries({ queryKey: ['calendar', 'cycle', 'collection-claims'] });
                    }}
                  />
                ))}
              </section>
            ) : null}

            {hasThemesOrMinistries ? (
              <section
                className={data.members.length > 0 ? 'mt-3' : undefined}
                aria-labelledby={themesMinistriesRegionId}
              >
                <h2 id={themesMinistriesRegionId} className="sr-only">
                  Темы и служения
                </h2>
                {data.global_themes.map((t, i) => (
                  <GlobalThemeCard key={`gt-${t.id}`} theme={t} cardIndex={i} />
                ))}
                {data.ministries.map((m, i) => (
                  <MinistryCard
                    key={`m-${m.id}`}
                    ministry={m}
                    cardIndex={data.global_themes.length + i}
                  />
                ))}
              </section>
            ) : null}

            {data.backsliders.length > 0 ? (
              <section
                className={
                  data.members.length > 0 || hasThemesOrMinistries ? 'mt-3' : undefined
                }
                aria-labelledby={sectionBacksliderId}
              >
                <SectionHeader
                  Icon={LuHandHeart}
                  title="Молимся за отпавшего"
                  id={sectionBacksliderId}
                />
                {data.backsliders.map((b, i) => (
                  <BacksliderCard key={b.id} b={b} cardIndex={i} />
                ))}
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyBlock />
        )}
      </div>
    </div>
  );
}
