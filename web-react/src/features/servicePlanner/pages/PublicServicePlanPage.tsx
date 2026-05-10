import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMinutes, format } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import {
  FaBookBible,
  FaBullhorn,
  FaCakeCandles,
  FaFeatherPointed,
  FaHandHoldingDollar,
  FaHandsPraying,
  FaMicrophoneLines,
  FaMusic,
  FaPuzzlePiece,
  FaWineGlass,
} from 'react-icons/fa6';
import { LuCalendarDays, LuClock3, LuLink, LuPencil, LuUsers } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';

import {
  fetchPublicServicePlan,
  type PublicServicePlanPayload,
} from '../api';
import { meaningfulNoteLinesFromRaw } from '../plannerNoteText';
import { safeServicePlanTimelineStart } from '../planPayloadNormalize';
import { sharePlanQueryRetry, sharePlanQueryRetryDelay } from '../sharePlanQueryHelpers';
import { EditableServicePlanPage } from './EditableServicePlanPage';

type PublicPlanBlock = PublicServicePlanPayload['blocks'][number];

type PublicBlockView = {
  compactMobile: boolean;
  noteToShow: string;
  poemSubline: string;
  birthdays: boolean;
  birthdaysList: string[];
  scheduleList: string[];
  sermon: boolean;
  sermonScripture: string;
  headingDisplay: string;
  showSongLine: boolean;
  songLine: string;
};

function derivePublicBlockView(b: PublicPlanBlock): PublicBlockView {
  try {
  const notesRaw = typeof b.content_json.notes === 'string' ? b.content_json.notes.trim() : '';
  const textRaw = typeof b.content_json.text === 'string' ? b.content_json.text.trim() : '';
  const rawForNote = notesRaw || textRaw;
  const fallback = meaningfulNoteLinesFromRaw(rawForNote, b.content_json);
  const titlePlain = String(b.title ?? '').trim();
  const titleStripped = stripLeadingBlockIndex(titlePlain);
  const songVariants = [
    b.song_title ?? '',
    b.song_title && b.song_key ? `${b.song_title} [${b.song_key}]` : '',
    titlePlain,
    titleStripped,
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => normalizeText(s));
  const noteIsSongDuplicate = fallback.length > 0 && songVariants.includes(normalizeText(fallback));
  const noteToShow = noteIsSongDuplicate ? '' : fallback;
  const poem = isPoem(b.block_type_code, b.block_type_name);
  const poemAuthor =
    typeof b.content_json.poem_author === 'string' ? b.content_json.poem_author.trim() : '';
  const poemTheme =
    typeof b.content_json.poem_theme === 'string' ? b.content_json.poem_theme.trim() : '';
  const poemSubline =
    poemAuthor && poemTheme ? `${poemAuthor} • ${poemTheme}` : poemAuthor || poemTheme;
  const birthdays = isBirthdays(b.block_type_code, b.block_type_name);
  const birthdaysList = birthdayRows(b.content_json);
  const scheduleList = scheduleRows(b.content_json);
  const sermon = isSermon(b.block_type_code, b.block_type_name);
  const sermonTopic =
    typeof b.content_json.sermon_topic === 'string' ? b.content_json.sermon_topic.trim() : '';
  const sermonScripture =
    typeof b.content_json.sermon_scripture === 'string' ? b.content_json.sermon_scripture.trim() : '';
  const sermonPreacher = b.assigned_member_name ?? 'Проповедник';
  const heading = poem
    ? `СТИХ - ${b.assigned_member_name ?? 'Чтец'}`
    : sermon
      ? sermonTopic
        ? `${sermonPreacher} - ${sermonTopic}`
        : sermonPreacher
      : birthdays
        ? 'Дни рождения недели'
        : b.title;
  const headingDisplay = stripLeadingBlockIndex(String(heading ?? '').trim());

  const songLine =
    b.song_title && String(b.song_title).trim()
      ? b.song_key && String(b.song_key).trim()
        ? `${String(b.song_title).trim()} [${String(b.song_key).trim()}]`
        : String(b.song_title).trim()
      : '';
  const showSongLine =
    songLine.length > 0 &&
    normalizeText(stripSongKeySuffix(songLine)) !== normalizeText(stripSongKeySuffix(headingDisplay));

  let extraSections = 0;
  if (poemSubline) extraSections += 1;
  if (sermon && sermonScripture) extraSections += 1;
  if (birthdays) extraSections += 1;
  if (scheduleList.length > 0) extraSections += 1;
  if (showSongLine) extraSections += 1;
  if (noteToShow) extraSections += 1;

  const longNote = noteToShow.length > 200;
  const manyScheduleLines = scheduleList.length > 4;
  const longBirthdayLine =
    birthdaysList.length > 0 && birthdaysList.join(' • ').length > 120;

  const compactMobile =
    extraSections === 0 && !longNote && !manyScheduleLines && !longBirthdayLine;

  return {
    compactMobile,
    noteToShow,
    poemSubline,
    birthdays,
    birthdaysList,
    scheduleList,
    sermon,
    sermonScripture,
    headingDisplay,
    showSongLine,
    songLine,
  };
  } catch {
    const titleFallback = stripLeadingBlockIndex(String(b.title ?? '').trim()) || 'Блок';
    return {
      compactMobile: true,
      noteToShow: '',
      poemSubline: '',
      birthdays: false,
      birthdaysList: [],
      scheduleList: [],
      sermon: false,
      sermonScripture: '',
      headingDisplay: titleFallback,
      showSongLine: false,
      songLine: '',
    };
  }
}

const ICON_BY_CODE: Record<string, { Icon: IconType; wrapClass: string; iconClass: string }> = {
  prayer: { Icon: FaHandsPraying, wrapClass: 'bg-violet-100', iconClass: 'text-violet-700' },
  song: { Icon: FaMusic, wrapClass: 'bg-sky-100', iconClass: 'text-sky-700' },
  scripture: { Icon: FaBookBible, wrapClass: 'bg-amber-100', iconClass: 'text-amber-700' },
  sermon: { Icon: FaMicrophoneLines, wrapClass: 'bg-rose-100', iconClass: 'text-rose-700' },
  announcements: { Icon: FaBullhorn, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  offering: { Icon: FaHandHoldingDollar, wrapClass: 'bg-lime-100', iconClass: 'text-lime-700' },
  birthdays: { Icon: FaCakeCandles, wrapClass: 'bg-pink-100', iconClass: 'text-pink-700' },
  schedule: { Icon: LuCalendarDays, wrapClass: 'bg-indigo-100', iconClass: 'text-indigo-700' },
  custom: { Icon: FaPuzzlePiece, wrapClass: 'bg-stone-200', iconClass: 'text-stone-700' },
};

const ICON_BY_MARK_KEY: Record<string, { Icon: IconType; wrapClass: string; iconClass: string }> = {
  ...ICON_BY_CODE,
  communion: { Icon: FaWineGlass, wrapClass: 'bg-purple-100', iconClass: 'text-purple-700' },
  donation: { Icon: FaHandHoldingDollar, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  poem: { Icon: FaFeatherPointed, wrapClass: 'bg-fuchsia-100', iconClass: 'text-fuchsia-700' },
  users: { Icon: LuUsers, wrapClass: 'bg-cyan-100', iconClass: 'text-cyan-700' },
  clock: { Icon: LuClock3, wrapClass: 'bg-indigo-100', iconClass: 'text-indigo-700' },
  note: { Icon: LuPencil, wrapClass: 'bg-orange-100', iconClass: 'text-orange-700' },
  link: { Icon: LuLink, wrapClass: 'bg-teal-100', iconClass: 'text-teal-700' },
};

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function isHiddenFromPublic(content: Record<string, unknown>): boolean {
  return content.hide_in_public === true;
}

function getBlockLogoUrl(content: Record<string, unknown>): string | null {
  const raw = content.block_logo_url;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value;
  }
  return null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripSongKeySuffix(value: string): string {
  return value.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
}

/** Убирает ведущую нумерацию вида «12. » из заголовка блока (из UI или из сохранённого title). */
function stripLeadingBlockIndex(value: string): string {
  return value.replace(/^\s*\d+\.\s+/, '').trim();
}

function isPoem(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'poem' || normalizedName.includes('стих');
}

function isSermon(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'sermon' || normalizedName.includes('проповед');
}

function isBirthdays(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'birthdays' || normalizedName.includes('дни рождения');
}

function birthdayRows(content: Record<string, unknown>): string[] {
  const raw = content.birthday_people;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const row = x as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) return null;
      const weekDate = typeof row.week_date === 'string' ? row.week_date.trim() : '';
      if (!weekDate) return name;
      const dt = new Date(`${weekDate}T12:00:00`);
      if (Number.isNaN(dt.getTime())) return name;
      const dateText = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).format(dt);
      return `${name} — ${dateText}`;
    })
    .filter((x): x is string => Boolean(x));
}

function scheduleRows(content: Record<string, unknown>): string[] {
  const raw = content.schedule_events;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const row = x as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!title) return null;
      const dateIso = typeof row.event_date === 'string' ? row.event_date.trim() : '';
      const time = typeof row.event_time === 'string' ? row.event_time.trim().slice(0, 5) : '';
      let datePart = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        const dt = new Date(`${dateIso}T12:00:00`);
        if (!Number.isNaN(dt.getTime())) {
          datePart = new Intl.DateTimeFormat('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }).format(dt);
        }
      }
      const prefix = [datePart, time].filter((v) => v.length > 0).join(' ');
      return prefix ? `${prefix} — ${title}` : title;
    })
    .filter((x): x is string => Boolean(x));
}

export function PublicServicePlanPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ['public', 'service-plan', token],
    queryFn: () => fetchPublicServicePlan(token ?? ''),
    enabled: Boolean(token && token.length > 20),
    retry: sharePlanQueryRetry,
    retryDelay: sharePlanQueryRetryDelay,
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    if (!q.data) return [];
    const { plan, blocks } = q.data;
    let cursor = safeServicePlanTimelineStart(plan);
    return blocks
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .filter((b) => !isHiddenFromPublic(b.content_json))
      .map((b) => {
        const startsAt = format(cursor, 'HH:mm');
        const separator = isSeparator(b.content_json);
        const duration = separator ? 0 : Math.max(0, b.duration_minutes);
        cursor = addMinutes(cursor, duration);
        return { ...b, startsAt, separator };
      });
  }, [q.data]);

  if (!token) {
    return <p className="p-6 text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) {
    return (
      <div className="min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--surface)] [max-height:var(--viewport-height,100dvh)]">
        <div className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-8">
          <SongListSkeleton />
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--surface)] [max-height:var(--viewport-height,100dvh)]">
        <div className="mx-auto max-w-2xl p-6">
          <p className="text-red-600">Программа не найдена или ссылка недействительна.</p>
        </div>
      </div>
    );
  }

  const { plan } = q.data;
  if (plan.status === 'draft') {
    return <EditableServicePlanPage />;
  }
  const dateText = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${plan.service_date}T12:00:00`));

  return (
    <div className="min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--surface)] [max-height:var(--viewport-height,100dvh)]">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 sm:space-y-6 sm:px-4 sm:py-8">
        <p className="text-sm">
          <Link to="/login" className="text-sky-600 hover:underline">
            Войти
          </Link>
        </p>

        <header className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          <h1 className="text-xl font-extrabold text-stone-900 sm:text-2xl">
            План собрания на {dateText}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600 sm:text-sm">
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Старт: {plan.start_time}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">{plan.total_duration_minutes} мин</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">
              Ведущий: {plan.leader_name ?? 'Не назначен'}
            </span>
            {plan.preacher_name ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5">Проповедник: {plan.preacher_name}</span>
            ) : null}
          </div>
        </header>

        <section className="space-y-2.5">
          {rows.map((b) => {
            if (b.separator) {
              const sepText = String(b.content_json.separator_text ?? b.title ?? 'Раздел');
              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5"
                >
                  <p className="text-center text-sm font-bold leading-snug text-stone-700 sm:text-base">{sepText}</p>
                </div>
              );
            }
            const m = derivePublicBlockView(b);
            const rowGap = m.compactMobile ? 'gap-2 sm:gap-2.5 sm:gap-3' : 'gap-2.5 sm:gap-3';
            const timeCell = [
              'w-11 shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-bold text-stone-700 sm:w-12 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs',
              m.compactMobile ? 'max-sm:py-0.5 max-sm:leading-tight max-sm:self-start' : '',
            ]
              .join(' ')
              .trim();

            return (
              <article
                key={b.id}
                className={[
                  'rounded-xl border border-stone-200 bg-white shadow-sm',
                  m.compactMobile ? 'p-2.5 sm:p-4' : 'p-3 sm:p-4',
                ].join(' ')}
              >
                <div className={`flex items-start ${rowGap}`}>
                  <div className={timeCell}>{b.startsAt}</div>
                  {(() => {
                    const logoUrl = getBlockLogoUrl(b.content_json);
                    const custom = typeof b.content_json.block_mark === 'string' ? b.content_json.block_mark.trim() : '';
                    const markIconKey =
                      typeof b.content_json.block_mark_icon === 'string'
                        ? b.content_json.block_mark_icon.trim().toLowerCase()
                        : '';
                    const markIcon = markIconKey ? ICON_BY_MARK_KEY[markIconKey] : null;
                    if (logoUrl) {
                      return (
                        <img
                          src={logoUrl}
                          alt="Лого блока"
                          className={m.compactMobile ? 'h-7 w-7 shrink-0 rounded-lg object-cover sm:h-8 sm:w-8' : 'h-8 w-8 shrink-0 rounded-lg object-cover'}
                        />
                      );
                    }
                    if (markIcon) {
                      const MarkIcon = markIcon.Icon;
                      const iconBox = m.compactMobile ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-8 w-8';
                      return (
                        <div
                          className={`inline-flex shrink-0 items-center justify-center rounded-lg ${iconBox} ${markIcon.wrapClass}`}
                        >
                          <MarkIcon
                            className={`${m.compactMobile ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'h-4 w-4'} ${markIcon.iconClass}`}
                          />
                        </div>
                      );
                    }
                    if (custom) {
                      const iconBox = m.compactMobile ? 'h-7 w-7 text-base sm:h-8 sm:w-8 sm:text-lg' : 'h-8 w-8 text-lg';
                      return (
                        <div
                          className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-stone-100 ${iconBox}`}
                        >
                          {custom}
                        </div>
                      );
                    }
                    const iconMeta = ICON_BY_CODE[(b.block_type_code ?? '').toLowerCase()];
                    if (iconMeta) {
                      const Icon = iconMeta.Icon;
                      const iconBox = m.compactMobile ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-8 w-8';
                      return (
                        <div
                          className={`inline-flex shrink-0 items-center justify-center rounded-lg ${iconBox} ${iconMeta.wrapClass}`}
                        >
                          <Icon
                            className={`${m.compactMobile ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'h-4 w-4'} ${iconMeta.iconClass}`}
                          />
                        </div>
                      );
                    }
                    const iconBox = m.compactMobile ? 'h-7 w-7 text-[11px] sm:h-8 sm:w-8 sm:text-sm' : 'h-8 w-8 text-sm';
                    return (
                      <div
                        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-stone-100 ${iconBox}`}
                      >
                        •
                      </div>
                    );
                  })()}
                  <div
                    className={[
                      'min-w-0 flex-1 sm:space-y-0',
                      m.compactMobile ? 'space-y-0.5' : 'space-y-1',
                    ].join(' ')}
                  >
                    <h2 className="text-[15px] font-bold leading-snug text-stone-900 sm:text-base">
                      {m.headingDisplay}
                    </h2>
                    <p className="mt-0 text-xs leading-snug text-stone-500 sm:mt-0.5 sm:text-sm">
                      {b.block_type_name ?? 'Блок'} • {b.duration_minutes} мин
                      {b.assigned_member_name ? ` • ${b.assigned_member_name}` : ''}
                    </p>
                    {m.poemSubline ? (
                      <p className="mt-0 text-xs leading-snug text-stone-600 sm:mt-0.5 sm:text-sm">{m.poemSubline}</p>
                    ) : null}
                    {m.sermon && m.sermonScripture ? (
                      <p className="mt-0 text-xs leading-snug text-stone-600 sm:mt-0.5 sm:text-sm">
                        Писание: {m.sermonScripture}
                      </p>
                    ) : null}
                    {m.birthdays ? (
                      m.birthdaysList.length > 0 ? (
                        <p className="mt-0 text-xs leading-snug text-stone-600 sm:mt-0.5 sm:text-sm">
                          Именинники: {m.birthdaysList.join(' • ')}
                        </p>
                      ) : (
                        <p className="mt-0 text-xs leading-snug text-stone-500 sm:mt-0.5 sm:text-sm">
                          На этой неделе именинников нет.
                        </p>
                      )
                    ) : null}
                    {m.scheduleList.length > 0 ? (
                      <div className="mt-0 text-xs leading-snug text-stone-600 sm:mt-0.5 sm:text-sm">
                        <p className="font-semibold">Расписание:</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {m.scheduleList.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {m.showSongLine ? (
                      <p className="mt-0 text-sm font-semibold leading-snug text-stone-700 sm:mt-1 sm:text-base">
                        {m.songLine}
                      </p>
                    ) : null}
                    {m.noteToShow ? (
                      <p className="mt-0 whitespace-pre-wrap text-sm leading-relaxed text-stone-700 sm:mt-1 sm:text-base">
                        {m.noteToShow}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
