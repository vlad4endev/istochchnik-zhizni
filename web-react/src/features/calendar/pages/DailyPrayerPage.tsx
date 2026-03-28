import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type ReactNode, useId, useState } from 'react';
import { DayPicker } from 'react-day-picker';

import {
  getApiBaseUrlFromEnv,
  isApiUrlProbablyWrongForWeb,
  resolveAxiosBaseURL,
} from '../../../lib/config';
import type { Backslider, DayPrayerData, GlobalTheme, Member, Ministry } from '../../../types';
import { formatCalendarDayKey, getCalendarDay } from '../api';

import 'react-day-picker/style.css';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function loadErrorDescription(err: unknown): string | null {
  if (err == null) return null;
  if (axios.isAxiosError(err)) {
    const code = err.response?.status;
    const ct = String(err.response?.headers?.['content-type'] ?? '');
    if (code === 404) {
      return 'Сервер вернул 404. Убедитесь, что адрес API — хост бэкенда с маршрутом /api/calendar, а не только статика.';
    }
    if (ct.includes('text/html')) {
      return 'Пришёл ответ HTML вместо JSON. Часто URL API совпадает с фронтендом — укажите отдельный адрес бэкенда.';
    }
    if (err.code === 'ERR_NETWORK' || err.message.toLowerCase().includes('network')) {
      return 'Не удаётся подключиться к серверу. Проверьте CORS, HTTPS и доступность API.';
    }
    const msg = err.message;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
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

function SectionHeader({ emoji, title, id }: { emoji: string; title: string; id?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 pl-0.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-lg" aria-hidden>
        {emoji}
      </div>
      <h2 id={id} className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
        {title}
      </h2>
    </div>
  );
}

function PrayerCard(props: {
  emoji: string;
  title: string;
  accentVar: string;
  children: ReactNode;
}) {
  const { emoji, title, accentVar, children } = props;
  return (
    <article
      className="mb-3.5 overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]"
      style={{ ['--card-accent' as string]: accentVar }}
    >
      <div className="border-b border-stone-100/90 px-4 pb-0 pt-[18px] shell:px-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg"
            style={{ backgroundColor: `color-mix(in srgb, ${accentVar} 12%, transparent)` }}
          >
            <span aria-hidden>{emoji}</span>
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

function MemberCard({ member }: { member: Member }) {
  const hasRequest = member.prayer_request != null && member.prayer_request.trim().length > 0;
  return (
    <PrayerCard emoji="🙏" title={member.name} accentVar="var(--member)">
      {hasRequest ? (
        <p className="text-[16px] text-stone-600">{member.prayer_request}</p>
      ) : (
        <p className="italic text-stone-400">Нет указанных нужд</p>
      )}
    </PrayerCard>
  );
}

function GlobalThemeCard({ theme }: { theme: GlobalTheme }) {
  const hasVerse = theme.bible_verse != null && theme.bible_verse.trim().length > 0;
  const hasPoints = theme.prayer_points != null && theme.prayer_points.trim().length > 0;
  const hasNothing = !hasVerse && !hasPoints;
  return (
    <PrayerCard emoji="📖" title={theme.title} accentVar="var(--theme)">
      {hasVerse ? (
        <div className="mb-3 rounded-xl border border-[color-mix(in_srgb,var(--theme)_18%,transparent)] bg-[color-mix(in_srgb,var(--theme)_8%,transparent)] px-3.5 py-3.5">
          <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">Библейский стих</p>
          <p className="text-[15px] italic leading-relaxed text-stone-600 whitespace-pre-wrap">{theme.bible_verse}</p>
        </div>
      ) : null}
      {hasPoints ? (
        <div>
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">Акценты молитвы</p>
          <p className="text-[16px] text-stone-600 whitespace-pre-wrap">{theme.prayer_points}</p>
        </div>
      ) : null}
      {hasNothing ? <p className="italic text-stone-400">Нет дополнительной информации</p> : null}
    </PrayerCard>
  );
}

function MinistryCard({ ministry }: { ministry: Ministry }) {
  const hasPoints = ministry.prayer_points != null && ministry.prayer_points.trim().length > 0;
  return (
    <PrayerCard emoji="🛠️" title={ministry.title} accentVar="var(--ministry)">
      {hasPoints ? (
        <div>
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">Пункты молитвы</p>
          <p className="text-[16px] text-stone-600 whitespace-pre-wrap">{ministry.prayer_points}</p>
        </div>
      ) : (
        <p className="italic text-stone-400">Нет указанных пунктов молитвы</p>
      )}
    </PrayerCard>
  );
}

function BacksliderCard({ b }: { b: Backslider }) {
  return (
    <PrayerCard emoji="🕯️" title={b.name} accentVar="var(--backslider)">
      <p className="italic text-stone-500">Молимся о возвращении к Господу и к общению с церковью</p>
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
          className="rounded-2xl border border-stone-100 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]"
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
      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/[0.08] text-4xl">
        ☁️
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
        ⟳ Повторить
      </button>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-primary/[0.08] text-5xl opacity-90">
        🙏
      </div>
      <h2 className="text-xl font-bold tracking-tight text-stone-900">Нет данных на эту дату</h2>
      <p className="mt-2 text-[15px] text-stone-500">Выберите другую дату в календаре</p>
    </div>
  );
}

const CAL_START = new Date(2020, 0, 1);
const CAL_END = new Date(2030, 11, 31);

export function DailyPrayerPage() {
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const sectionMemberId = useId();
  const sectionThemesId = useId();
  const sectionMinistryId = useId();
  const sectionBacksliderId = useId();

  const dateKey = formatCalendarDayKey(selected);

  const {
    data,
    isPending,
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

  return (
    <div className="min-h-full bg-[var(--surface)] pb-28 shell:pb-8">
      <header className="bg-primary px-5 py-5 text-white shadow-sm shell:rounded-none">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight shell:text-[26px]">Молитва</h1>
      </header>

      {/* Чип даты (как во Flutter) */}
      <div className="px-4 pt-2.5 shell:px-6">
        <button
          type="button"
          onClick={() => setCalendarExpanded((e) => !e)}
          className="flex w-full items-center gap-3 rounded-full bg-[var(--surface-elevated)] px-4 py-3 text-left shadow-[var(--shadow)] transition hover:bg-stone-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            📅
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-stone-900 shell:text-base">{chipLabel}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-[var(--accent)]">
              СЕГОДНЯ
            </span>
          ) : null}
          <span
            className={`shrink-0 text-2xl text-stone-400 transition-transform duration-200 ${calendarExpanded ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ⌄
          </span>
        </button>
      </div>

      {/* Раскрывающийся календарь */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${calendarExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="mx-4 mt-3 rounded-b-3xl border border-t-0 border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-5 shadow-[var(--shadow)] shell:mx-6">
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
                  'flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium text-stone-800 hover:bg-stone-100 shell:h-10 shell:w-10 shell:text-[15px]',
                selected: 'bg-primary font-semibold text-white hover:bg-primary hover:text-white',
                today: 'font-bold text-primary',
              }}
            />
            <div className="mt-3 flex justify-end border-t border-stone-100 pt-3">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100"
                onClick={() => setCalendarExpanded(false)}
              >
                Свернуть
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 shell:px-6">
        {isPending ? (
          <CalendarPrayerSkeleton />
        ) : isError ? (
          <ErrorBlock err={queryError} onRetry={() => void refetch()} />
        ) : hasPrayerContent(data) ? (
          <div className="pb-6">
            {data.members.length > 0 ? (
              <section aria-labelledby={sectionMemberId}>
                <SectionHeader emoji="🙏" title="Молитва за члена церкви" id={sectionMemberId} />
                {data.members.map((m) => (
                  <MemberCard key={m.id} member={m} />
                ))}
              </section>
            ) : null}

            {data.global_themes.length > 0 ? (
              <section
                className={data.members.length > 0 ? 'mt-6' : undefined}
                aria-labelledby={sectionThemesId}
              >
                <SectionHeader emoji="📖" title="Глобальные темы" id={sectionThemesId} />
                {data.global_themes.map((t) => (
                  <GlobalThemeCard key={`gt-${t.id}`} theme={t} />
                ))}
              </section>
            ) : null}

            {data.ministries.length > 0 ? (
              <section
                className={
                  data.members.length > 0 || data.global_themes.length > 0 ? 'mt-6' : undefined
                }
                aria-labelledby={sectionMinistryId}
              >
                <SectionHeader emoji="🛠️" title="Служения" id={sectionMinistryId} />
                {data.ministries.map((m) => (
                  <MinistryCard key={`m-${m.id}`} ministry={m} />
                ))}
              </section>
            ) : null}

            {data.backsliders.length > 0 ? (
              <section
                className={
                  data.members.length > 0 ||
                  data.global_themes.length > 0 ||
                  data.ministries.length > 0
                    ? 'mt-6'
                    : undefined
                }
                aria-labelledby={sectionBacksliderId}
              >
                <SectionHeader emoji="📍" title="Отпавшие" id={sectionBacksliderId} />
                {data.backsliders.map((b) => (
                  <BacksliderCard key={b.id} b={b} />
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
