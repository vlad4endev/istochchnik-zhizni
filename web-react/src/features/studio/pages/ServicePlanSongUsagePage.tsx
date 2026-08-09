import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuCalendarDays,
  LuChartColumnIncreasing,
  LuClock3,
  LuMusic2,
  LuTrendingUp,
} from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import {
  fetchServicePlanSongUsage,
  type ServicePlanSongRecentUsage,
  type ServicePlanSongUsageItem,
  type ServicePlanSongUsagePeriod,
} from '../api';
import { studioEditSongLink, useStudioEditorBackTo, useStudioModuleSurface } from '../studioPaths';

const PERIOD_OPTIONS: { value: ServicePlanSongUsagePeriod; label: string }[] = [
  { value: 3, label: '3 мес' },
  { value: 6, label: '6 мес' },
  { value: 12, label: '12 мес' },
  { value: 'all', label: 'Всё время' },
];

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

function formatServiceDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return shortDateFmt.format(d);
}

function songLabel(song: { song_number: number | null; title: string }): string {
  return song.song_number != null ? `${song.song_number}. ${song.title}` : song.title;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof LuMusic2;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-editor-mute)]">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--studio-editor-text)]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[var(--studio-editor-mute)]">{hint}</p> : null}
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--studio-nav-active-bg)] text-[var(--studio-editor-accent)]">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function TopSongRow({
  song,
  rank,
  maxCount,
  editorBackTo,
}: {
  song: ServicePlanSongUsageItem;
  rank: number;
  maxCount: number;
  editorBackTo: string;
}) {
  const widthPct = maxCount > 0 ? Math.max(8, Math.round((song.usage_count / maxCount) * 100)) : 0;

  return (
    <li className="group rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 shadow-sm transition hover:border-[var(--studio-editor-accent)]/30">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--studio-nav-active-bg)] text-xs font-bold text-[var(--studio-editor-accent)]"
          aria-hidden
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              {...studioEditSongLink(song.song_id, editorBackTo)}
              className="truncate text-sm font-semibold text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]"
            >
              {songLabel(song)}
            </Link>
            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--studio-editor-accent)]">
              {song.usage_count}×
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--studio-nav-active-bg)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--studio-editor-accent)] to-[#a84d5a] transition-all duration-500"
              style={{ width: `${widthPct}%` }}
              role="presentation"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--studio-editor-mute)]">
            {song.default_key ? <span>Тональность: {song.default_key}</span> : null}
            {song.last_used_date ? (
              <span>Последний раз: {formatShortDate(song.last_used_date)}</span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function groupRecentByDate(entries: ServicePlanSongRecentUsage[]): { date: string; items: ServicePlanSongRecentUsage[] }[] {
  const map = new Map<string, ServicePlanSongRecentUsage[]>();
  for (const e of entries) {
    const list = map.get(e.service_date) ?? [];
    list.push(e);
    map.set(e.service_date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

export function ServicePlanSongUsagePage() {
  const surface = useStudioModuleSurface();
  const editorBackTo = useStudioEditorBackTo();
  const inStudioShell = surface !== 'songbook';
  const [period, setPeriod] = useState<ServicePlanSongUsagePeriod>(12);

  const q = useQuery({
    queryKey: ['studio', 'service-plan-song-usage', period],
    queryFn: () => fetchServicePlanSongUsage(period),
    staleTime: 2 * 60_000,
  });

  const maxTopCount = useMemo(() => {
    const top = q.data?.top_songs ?? [];
    return top.length > 0 ? Math.max(...top.map((s) => s.usage_count)) : 0;
  }, [q.data?.top_songs]);

  const recentGroups = useMemo(
    () => groupRecentByDate(q.data?.recent_usages ?? []),
    [q.data?.recent_usages],
  );

  const periodLabel =
    period === 'all' ? 'за всё время' : `за ${period} ${period === 3 ? 'месяца' : 'месяцев'}`;

  if (q.isLoading) return <SongListSkeleton variant="studio" />;

  if (q.isError) {
    const apiError =
      axios.isAxiosError(q.error) && typeof q.error.response?.data?.error === 'string'
        ? q.error.response.data.error
        : null;
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-900">
        <p className="font-semibold">Не удалось загрузить аналитику</p>
        {apiError ? <p className="text-red-800">{apiError}</p> : null}
        <p className="text-red-800/90">Проверьте подключение и попробуйте обновить страницу.</p>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="inline-flex min-h-[40px] items-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-900 hover:bg-red-100"
        >
          Повторить
        </button>
      </div>
    );
  }

  const data = q.data!;
  const stats = data.stats;
  const isEmpty = stats.services_with_songs === 0;

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6'
      : '';

  return (
    <div className={['mx-auto max-w-4xl space-y-8 pb-8', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-4 border-b border-[var(--studio-editor-border)] pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-3 py-1 text-xs font-semibold text-[var(--studio-editor-accent)]">
            <LuChartColumnIncreasing className="h-3.5 w-3.5" aria-hidden />
            Планировщик служений
          </div>
          <h1 className="studio-page-heading text-2xl font-bold tracking-tight text-[var(--studio-editor-text)] md:text-3xl">
            Аналитика песен
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--studio-editor-mute)]">
            Какие песни чаще всего входят в программы собраний, когда их пели в последний раз и что давно не
            звучало на служении.
          </p>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Период аналитики"
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(opt.value)}
                className={[
                  'min-h-[40px] rounded-xl px-4 text-sm font-semibold transition',
                  active
                    ? 'bg-[var(--studio-editor-accent)] text-white shadow-sm'
                    : 'border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] text-[var(--studio-editor-text)] hover:bg-[var(--studio-nav-active-bg)]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-6 py-16 text-center">
          <LuMusic2 className="mx-auto h-10 w-10 text-[var(--studio-editor-mute)]" aria-hidden />
          <p className="mt-4 text-base font-semibold text-[var(--studio-editor-text)]">
            Пока нет данных {periodLabel}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--studio-editor-mute)]">
            Добавьте блоки «Песня» в программы служений в планировщике — здесь появится статистика по
            использованию.
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Сводка">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={LuCalendarDays}
                label="Служений с песнями"
                value={stats.services_with_songs}
                hint={periodLabel}
              />
              <StatCard
                icon={LuMusic2}
                label="Уникальных песен"
                value={stats.unique_songs}
                hint="Разных названий в программах"
              />
              <StatCard
                icon={LuTrendingUp}
                label="Всего исполнений"
                value={stats.total_song_slots}
                hint="Сумма всех блоков «Песня»"
              />
              <StatCard
                icon={LuChartColumnIncreasing}
                label="В среднем на служение"
                value={stats.avg_songs_per_service}
                hint="песен в программе"
              />
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="top-songs-heading">
            <div className="flex items-center gap-2">
              <LuTrendingUp className="h-5 w-5 text-[var(--studio-editor-accent)]" aria-hidden />
              <h2
                id="top-songs-heading"
                className={`text-lg font-bold ${inStudioShell ? 'text-[var(--studio-editor-text)]' : 'text-[var(--text)]'}`}
              >
                Чаще всего поём
              </h2>
            </div>
            <ul className="space-y-2">
              {data.top_songs.map((song, i) => (
                <TopSongRow key={song.song_id} song={song} rank={i + 1} maxCount={maxTopCount} editorBackTo={editorBackTo} />
              ))}
            </ul>
          </section>

          <section className="space-y-4" aria-labelledby="recent-heading">
            <div className="flex items-center gap-2">
              <LuClock3 className="h-5 w-5 text-[var(--studio-editor-accent)]" aria-hidden />
              <h2
                id="recent-heading"
                className={`text-lg font-bold ${inStudioShell ? 'text-[var(--studio-editor-text)]' : 'text-[var(--text)]'}`}
              >
                Недавние исполнения
              </h2>
            </div>
            <div className="space-y-4">
              {recentGroups.map((group) => (
                <div
                  key={group.date}
                  className="overflow-hidden rounded-2xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] shadow-sm"
                >
                  <div className="border-b border-[var(--studio-editor-border)] bg-[var(--studio-nav-active-bg)]/50 px-4 py-2.5">
                    <p className="text-sm font-semibold text-[var(--studio-editor-text)]">
                      {formatServiceDate(group.date)}
                    </p>
                  </div>
                  <ul className="divide-y divide-[var(--studio-editor-border)]">
                    {group.items.map((item, idx) => (
                      <li key={`${item.service_plan_id}-${item.song_id}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <Link
                          {...studioEditSongLink(item.song_id, editorBackTo)}
                          className="min-w-0 flex-1 text-sm font-medium text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]"
                        >
                          {songLabel(item)}
                          {item.default_key ? (
                            <span className="ml-2 text-xs font-normal text-[var(--studio-editor-mute)]">
                              {item.default_key}
                            </span>
                          ) : null}
                        </Link>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-[var(--studio-editor-mute)]">
                          {item.leader_name ? <span>Ведущий: {item.leader_name}</span> : null}
                          {item.plan_status === 'draft' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                              черновик
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {data.stale_songs.length > 0 ? (
            <section className="space-y-4" aria-labelledby="stale-heading">
              <div>
                <h2
                  id="stale-heading"
                  className={`text-lg font-bold ${inStudioShell ? 'text-[var(--studio-editor-text)]' : 'text-[var(--text)]'}`}
                >
                  Давно не звучали
                </h2>
                <p className="mt-1 text-sm text-[var(--studio-editor-mute)]">
                  Пели раньше, но не входили в программы {periodLabel}
                </p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.stale_songs.map((song) => (
                  <li
                    key={song.song_id}
                    className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 shadow-sm"
                  >
                    <Link
                      {...studioEditSongLink(song.song_id, editorBackTo)}
                      className="text-sm font-semibold text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]"
                    >
                      {songLabel(song)}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--studio-editor-mute)]">
                      {song.usage_count}× всего
                      {song.last_used_date ? ` · последний раз ${formatShortDate(song.last_used_date)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
