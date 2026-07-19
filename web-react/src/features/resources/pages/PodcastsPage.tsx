import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LuArrowUpRight, LuCheck, LuHeadphones, LuHeart, LuPlay, LuRefreshCw, LuSearch, LuSettings, LuShare2, LuX } from 'react-icons/lu';

import { fetchPodcastFeed, fetchPodcastSettings, patchPodcastSettings, type PodcastEpisode } from '../../../api/resources';
import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';
import { useAuthStore } from '../../auth/authStore';
import {
  episodeDisplayDescription,
  isBoilerplateDescription,
  parseEpisodeTitle,
} from '../utils/sermonEpisodeDisplay';
import { progressRatio, useSermonPlayback } from '../sermonPlayback/SermonPlaybackContext';

type ListFilter = 'all' | 'favorites' | 'in_progress';

function formatDuration(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function formatPubDate(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function episodeSubtitle(ep: PodcastEpisode): string {
  const parts: string[] = [];
  const d = formatPubDate(ep.pubDate);
  const t = formatDuration(ep.duration);
  if (d) parts.push(d);
  if (t) parts.push(t);
  return parts.join(' • ');
}

export function PodcastsPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const role = useAuthStore((s) => s.role);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rssDraft, setRssDraft] = useState('');
  const {
    session,
    audioState,
    isPlaying,
    playEpisode,
    toggleFavorite,
  } = useSermonPlayback();

  const q = useQuery({
    queryKey: ['resources', 'podcasts'],
    queryFn: () => fetchPodcastFeed({ limit: 120 }),
  });

  const settingsQ = useQuery({
    queryKey: ['resources', 'podcasts', 'settings'],
    queryFn: fetchPodcastSettings,
    enabled: settingsOpen && isAdmin,
    staleTime: 0,
  });

  const saveSettings = useMutation({
    mutationFn: (rss_url: string | null) => patchPodcastSettings(rss_url),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources', 'podcasts'] });
      qc.invalidateQueries({ queryKey: ['resources', 'podcasts', 'settings'] });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { kind: 'success', message: 'RSS сохранён' } }));
      setSettingsOpen(false);
    },
    onError: () => {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { kind: 'error', message: 'Не удалось сохранить RSS' } }));
    },
  });

  const feed = q.data?.feed ?? null;
  const episodes = useMemo(() => (Array.isArray(q.data?.episodes) ? q.data!.episodes : []), [q.data]);
  const activeId = session?.episode.id ?? null;
  const playerOpen = Boolean(session);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    return episodes.filter((e) => {
      const ratio = progressRatio(audioState.progress[e.id]);
      const listened = Boolean(audioState.listened[e.id]) || ratio >= 0.98;
      const isFav = Boolean(audioState.favorites[e.id]);
      const inProgress = ratio > 0 && !listened;

      if (listFilter === 'favorites' && !isFav) return false;
      if (listFilter === 'in_progress' && !inProgress) return false;

      if (!t) return true;
      const { topic, author } = parseEpisodeTitle(e.title);
      const hay = `${e.title}\n${topic}\n${author ?? ''}\n${e.description ?? ''}`.toLowerCase();
      return hay.includes(t);
    });
  }, [episodes, query, listFilter, audioState.favorites, audioState.progress, audioState.listened]);

  const filterCounts = useMemo(() => {
    let favorites = 0;
    let inProgress = 0;
    for (const e of episodes) {
      if (audioState.favorites[e.id]) favorites += 1;
      const ratio = progressRatio(audioState.progress[e.id]);
      const listened = Boolean(audioState.listened[e.id]) || ratio >= 0.98;
      if (ratio > 0 && !listened) inProgress += 1;
    }
    return { all: episodes.length, favorites, inProgress };
  }, [episodes, audioState.favorites, audioState.progress, audioState.listened]);

  async function tryShare(title: string, url: string) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      await navigator.clipboard.writeText(url);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { kind: 'success', message: 'Ссылка скопирована' } }));
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  const filterChips: { id: ListFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Все', count: filterCounts.all },
    { id: 'favorites', label: 'Избранное', count: filterCounts.favorites },
    { id: 'in_progress', label: 'Слушаю', count: filterCounts.inProgress },
  ];

  return (
    <div
      className={[
        'min-h-full bg-[var(--surface)] lg:pb-8',
        /* main already pads for bottom nav — only reserve space for the sticky player */
        playerOpen ? 'pb-24 max-lg:pb-[5.75rem] lg:pb-28' : 'max-lg:pb-0',
      ].join(' ')}
    >
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Проповеди" />
      </div>

      <div className="py-5 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:py-8 sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] md:pl-6 md:pr-6 lg:pl-8 lg:pr-8 xl:pl-10 xl:pr-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 sm:gap-6 md:max-w-xl lg:max-w-4xl xl:max-w-6xl">
          <section className="overflow-hidden rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-3.5 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)] lg:p-8 shell:p-8">
            <div className="mb-4 flex flex-col gap-3.5 sm:mb-6 sm:gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70 sm:h-16 sm:w-16">
                    {feed?.imageUrl ? (
                      <img src={feed.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-stone-400">
                        <LuHeadphones className="h-7 w-7" strokeWidth={1.8} aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-extrabold text-stone-900 sm:text-lg md:text-xl">Аудио проповеди</h2>
                    {feed?.description && !isBoilerplateDescription(feed.description) ? (
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-stone-600">
                        {feed.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-medium leading-snug text-stone-500">
                        Слушайте проповеди, добавляйте в избранное и продолжайте с того места, где остановились.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-stone-500">
                      <span>{filtered.length} выпусков</span>
                      {feed?.lastBuildDate ? <span>Обновление: {formatPubDate(feed.lastBuildDate) ?? feed.lastBuildDate}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 self-start sm:w-auto">
                  {feed?.link ? (
                    <a
                      href={feed.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 active:scale-[0.98] sm:flex-none sm:px-4"
                    >
                      <LuArrowUpRight className="h-4 w-4" strokeWidth={2} />
                      Сайт
                    </a>
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      className="inline-flex h-10 min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-stone-100 px-3 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-200 hover:text-stone-900 active:scale-[0.98] sm:flex-none sm:px-4"
                      onClick={() => {
                        setSettingsOpen(true);
                        setRssDraft('');
                      }}
                    >
                      <LuSettings className="h-4 w-4" strokeWidth={2} aria-hidden />
                      Настройки
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-10 min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50 sm:flex-none sm:px-4"
                    onClick={() => q.refetch()}
                    disabled={q.isFetching}
                  >
                    <LuRefreshCw className={['h-4 w-4', q.isFetching ? 'animate-spin' : ''].join(' ')} strokeWidth={2} />
                    Обновить
                  </button>
                </div>
              </div>

              {settingsOpen ? (
                <div className="rounded-3xl border-2 border-primary/20 bg-primary/5 p-5 sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-stone-900">Настройка RSS подкастов</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-stone-600">
                        Вставьте RSS URL (например, Simplecast/CastBox). Пустое значение — вернёт сервер к RSS по умолчанию.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50 self-start"
                    >
                      <LuX className="h-4 w-4" strokeWidth={2} aria-hidden />
                      Закрыть
                    </button>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-extrabold uppercase tracking-wide text-stone-600">
                      RSS URL
                    </label>
                    <input
                      className="mt-2 h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900 shadow-sm outline-none transition focus:border-primary"
                      placeholder="https://example.com/feed.xml"
                      value={rssDraft}
                      onChange={(e) => setRssDraft(e.target.value)}
                      disabled={saveSettings.isPending}
                    />
                    <p className="mt-2 text-xs font-semibold text-stone-500">
                      Текущее значение:{' '}
                      <span className="font-mono">
                        {settingsQ.isLoading
                          ? 'загрузка…'
                          : (settingsQ.data?.rss_url ?? feed?.rssUrl ?? '').trim() || '(по умолчанию)'}
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-md shadow-primary/25 hover:bg-primary-dark disabled:opacity-50"
                      disabled={saveSettings.isPending}
                      onClick={() => {
                        const v = rssDraft.trim();
                        saveSettings.mutate(v ? v : null);
                      }}
                    >
                      <LuCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
                      {saveSettings.isPending ? 'Сохранение…' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                      disabled={saveSettings.isPending}
                      onClick={() => {
                        const current = (settingsQ.data?.rss_url ?? '').trim();
                        setRssDraft(current);
                      }}
                    >
                      Заполнить текущим
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={saveSettings.isPending}
                      onClick={() => saveSettings.mutate(null)}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
              ) : null}

              <label className="group relative">
                <span className="sr-only">Поиск по выпускам</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                  <LuSearch className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по названию, автору или описанию…"
                  className="h-11 w-full rounded-2xl border border-stone-200 bg-white pl-10 pr-4 text-sm font-semibold text-stone-900 shadow-sm outline-none transition focus:border-primary"
                />
              </label>

              <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Фильтр проповедей">
                {filterChips.map((chip) => {
                  const selected = listFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setListFilter(chip.id)}
                      className={[
                        'inline-flex h-10 min-h-[40px] shrink-0 touch-manipulation items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition',
                        selected
                          ? 'bg-stone-900 text-white shadow-sm'
                          : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                      ].join(' ')}
                    >
                      {chip.label}
                      <span
                        className={[
                          'tabular-nums',
                          selected ? 'text-white/70' : 'text-stone-400',
                        ].join(' ')}
                      >
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {q.isLoading ? (
              <div className="space-y-3" aria-busy="true" aria-live="polite">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 rounded-2xl border border-stone-100 bg-white/60 p-4">
                    <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-stone-200/90" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-[70%] animate-pulse rounded bg-stone-200/90" />
                      <div className="h-3 w-[45%] animate-pulse rounded bg-stone-100" />
                      <div className="h-10 w-full animate-pulse rounded bg-stone-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : q.isError ? (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950">
                <p className="text-sm font-extrabold uppercase tracking-wide text-red-800">Не удалось загрузить подкасты</p>
                <p className="mt-1 text-sm font-medium text-red-900">
                  Проверьте доступность API и что на сервере открыт маршрут <code>/api/resources/podcasts</code>.
                </p>
              </div>
            ) : episodes.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white/60 p-5 text-center">
                <p className="text-sm font-semibold text-stone-700">Пока нет выпусков</p>
                <p className="mt-1 text-xs text-stone-500">Если RSS недоступен — проверьте переменную `RESOURCES_PODCAST_RSS_URL` на сервере.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white/60 p-5 text-center">
                <p className="text-sm font-semibold text-stone-700">
                  {listFilter === 'favorites'
                    ? 'В избранном пока пусто'
                    : listFilter === 'in_progress'
                      ? 'Нет проповедей в процессе прослушивания'
                      : 'Ничего не найдено'}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {query.trim()
                    ? 'Попробуйте изменить запрос поиска.'
                    : listFilter === 'all'
                      ? 'Попробуйте изменить запрос поиска.'
                      : 'Переключитесь на «Все», чтобы увидеть полный список.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4">
                {filtered.map((ep) => {
                  const sub = episodeSubtitle(ep);
                  const { topic, author } = parseEpisodeTitle(ep.title);
                  const description = episodeDisplayDescription(ep.description, feed?.description);
                  const isActive = activeId === ep.id;
                  const isFav = Boolean(audioState.favorites[ep.id]);
                  const ratio = progressRatio(audioState.progress[ep.id]);
                  const listened = Boolean(audioState.listened[ep.id]) || ratio >= 0.98;
                  const statusLabel = listened ? 'ПРОСЛУШАНО' : ratio > 0 ? `${Math.round(ratio * 100)}%` : 'НОВОЕ';
                  return (
                    <article
                      key={ep.id}
                      className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white/70 p-3.5 shadow-sm transition hover:bg-white sm:rounded-3xl sm:p-5"
                    >
                      <div className="flex min-w-0 items-start gap-2.5 sm:gap-4">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200/70 sm:h-16 sm:w-16 sm:rounded-2xl">
                          {ep.imageUrl ? (
                            <img src={ep.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-stone-400">
                              <LuHeadphones className="h-6 w-6" strokeWidth={1.8} aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start gap-2">
                            <h3 className="min-w-0 flex-1 line-clamp-2 text-[15px] font-extrabold leading-snug text-stone-900 sm:text-base">
                              {topic}
                            </h3>
                            <span
                              className={[
                                'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold leading-none',
                                listened
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70'
                                  : ratio > 0
                                    ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                    : 'bg-stone-100 text-stone-600 ring-1 ring-stone-200/70',
                              ].join(' ')}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {author ? (
                            <p className="mt-0.5 truncate text-xs font-semibold text-stone-500">{author}</p>
                          ) : null}
                          {sub ? (
                            <p className="mt-1 text-xs font-semibold text-stone-500">{sub}</p>
                          ) : null}
                          {ratio > 0 && !listened ? (
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200/60">
                              <div className="h-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </div>
                          ) : null}
                          <div className="mt-3 flex w-full min-w-0 items-center gap-1.5 sm:gap-2">
                            <button
                              type="button"
                              onClick={() => playEpisode(ep, feed?.title)}
                              className={[
                                'inline-flex h-11 min-h-[44px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-2 rounded-2xl px-3 text-sm font-extrabold shadow-sm transition sm:flex-none sm:px-4',
                                isActive
                                  ? 'bg-primary text-white shadow-primary/25'
                                  : 'bg-stone-900 text-white hover:bg-stone-800',
                              ].join(' ')}
                            >
                              <LuPlay className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                              <span className="truncate">
                                {isActive ? (isPlaying ? 'Играет' : 'В плеере') : 'Слушать'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(ep.id)}
                              className={[
                                'inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-2xl shadow-sm transition sm:w-auto sm:min-w-0 sm:gap-2 sm:px-3',
                                isFav
                                  ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 hover:bg-rose-100'
                                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                              ].join(' ')}
                              aria-pressed={isFav}
                              aria-label={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
                              title={isFav ? 'В избранном' : 'В избранное'}
                            >
                              <LuHeart className={['h-4 w-4', isFav ? 'fill-current' : ''].join(' ')} strokeWidth={2} aria-hidden />
                              <span className="hidden text-sm font-extrabold sm:inline">
                                {isFav ? 'В избранном' : 'В избранное'}
                              </span>
                            </button>
                            {ep.pageUrl ? (
                              <button
                                type="button"
                                onClick={() => void tryShare(ep.title, ep.pageUrl!)}
                                className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                                aria-label="Поделиться"
                                title="Поделиться"
                              >
                                <LuShare2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                              </button>
                            ) : null}
                            {ep.pageUrl ? (
                              <a
                                href={ep.pageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                                aria-label="Открыть на сайте"
                                title="Открыть"
                              >
                                <LuArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                              </a>
                            ) : null}
                          </div>
                          {description ? (
                            <p className="mt-3 line-clamp-2 text-sm font-medium leading-snug text-stone-600">
                              {description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
