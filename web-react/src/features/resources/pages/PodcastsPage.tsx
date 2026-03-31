import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LuArrowUpRight, LuDownload, LuHeadphones, LuRefreshCw, LuSearch, LuShare2 } from 'react-icons/lu';

import { fetchPodcastFeed, type PodcastEpisode } from '../../../api/resources';

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
  const [query, setQuery] = useState('');
  const q = useQuery({
    queryKey: ['resources', 'podcasts'],
    queryFn: () => fetchPodcastFeed({ limit: 120 }),
  });

  const feed = q.data?.feed ?? null;
  const episodes = useMemo(() => (Array.isArray(q.data?.episodes) ? q.data!.episodes : []), [q.data]);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return episodes;
    return episodes.filter((e) => {
      const hay = `${e.title}\n${e.description ?? ''}`.toLowerCase();
      return hay.includes(t);
    });
  }, [episodes, query]);

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

  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <header className="bg-primary px-4 py-4 text-white shadow-[0_4px_24px_rgba(125,54,64,0.3)] sm:px-5 sm:py-5 md:rounded-none md:shadow-sm md:px-6 max-md:rounded-b-[1.75rem]">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">Ресурсы</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
          Подкасты (загрузка по RSS{feed?.cached ? ' • кэш' : ''})
        </p>
      </header>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 sm:gap-6 md:max-w-xl lg:max-w-4xl xl:max-w-6xl">
          <section className="rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)] lg:p-8 shell:p-8">
            <div className="mb-5 flex flex-col gap-4 sm:mb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70">
                    {feed?.imageUrl ? (
                      <img src={feed.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-stone-400">
                        <LuHeadphones className="h-7 w-7" strokeWidth={1.8} aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-extrabold text-stone-900 sm:text-lg md:text-xl">
                      {feed?.title ?? 'Подкасты'}
                    </h2>
                    {feed?.description ? (
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-stone-600">
                        {feed.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-medium leading-snug text-stone-500">
                        Все выпуски загружаются по RSS.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-stone-500">
                      <span>{filtered.length} выпусков</span>
                      {feed?.lastBuildDate ? <span>Обновление: {formatPubDate(feed.lastBuildDate) ?? feed.lastBuildDate}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start">
                  {feed?.link ? (
                    <a
                      href={feed.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 active:scale-[0.98]"
                    >
                      <LuArrowUpRight className="h-4 w-4" strokeWidth={2} />
                      Сайт
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
                    onClick={() => q.refetch()}
                    disabled={q.isFetching}
                  >
                    <LuRefreshCw className={['h-4 w-4', q.isFetching ? 'animate-spin' : ''].join(' ')} strokeWidth={2} />
                    Обновить
                  </button>
                </div>
              </div>

              <label className="group relative">
                <span className="sr-only">Поиск по выпускам</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                  <LuSearch className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по названию или описанию…"
                  className="h-11 w-full rounded-2xl border border-stone-200 bg-white pl-10 pr-4 text-sm font-semibold text-stone-900 shadow-sm outline-none transition focus:border-primary"
                />
              </label>
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
                <p className="text-sm font-semibold text-stone-700">Ничего не найдено</p>
                <p className="mt-1 text-xs text-stone-500">Попробуйте изменить запрос поиска.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4">
                {filtered.map((ep) => {
                  const sub = episodeSubtitle(ep);
                  return (
                    <article
                      key={ep.id}
                      className="rounded-3xl border border-stone-200/70 bg-white/70 p-4 shadow-sm transition hover:bg-white sm:p-5"
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70">
                          {ep.imageUrl ? (
                            <img src={ep.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-stone-400">
                              <LuHeadphones className="h-6 w-6" strokeWidth={1.8} aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-extrabold leading-snug text-stone-900 sm:text-base">
                            {ep.title}
                          </h3>
                          {sub ? (
                            <p className="mt-1 text-xs font-semibold text-stone-500">{sub}</p>
                          ) : (
                            <p className="mt-1 text-xs font-semibold text-stone-500"> </p>
                          )}
                          {ep.description ? (
                            <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-stone-600">
                              {ep.description}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {ep.pageUrl ? (
                              <button
                                type="button"
                                onClick={() => void tryShare(ep.title, ep.pageUrl!)}
                                className="inline-flex h-9 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
                              >
                                <LuShare2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                                Поделиться
                              </button>
                            ) : null}
                            <a
                              href={ep.audioUrl}
                              download
                              className="inline-flex h-9 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
                            >
                              <LuDownload className="h-4 w-4" strokeWidth={2} aria-hidden />
                              Скачать
                            </a>
                            {ep.pageUrl ? (
                              <a
                                href={ep.pageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
                              >
                                <LuArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                                Открыть
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <audio controls preload="none" className="w-full">
                          <source src={ep.audioUrl} />
                        </audio>
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

