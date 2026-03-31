import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LuArrowUpRight, LuCheck, LuHeadphones, LuHeart, LuPlay, LuRefreshCw, LuSearch, LuSettings, LuShare2, LuX } from 'react-icons/lu';

import { fetchPodcastFeed, fetchPodcastSettings, patchPodcastSettings, type PodcastEpisode } from '../../../api/resources';
import { useAuthStore } from '../../auth/authStore';

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
  const role = useAuthStore((s) => s.role);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rssDraft, setRssDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTickRef = useRef(0);

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
  const activeEpisode = useMemo(
    () => (activeId ? episodes.find((e) => e.id === activeId) ?? null : null),
    [activeId, episodes],
  );
  const token = useAuthStore((s) => s.token);
  const storageKey = useMemo(() => {
    const suffix = (token ?? 'anon').slice(-12);
    return `sermons_audio_v1:${suffix}`;
  }, [token]);

  type AudioState = {
    favorites: Record<string, true>;
    progress: Record<string, { position: number; duration: number | null; updatedAt: number }>;
    listened: Record<string, true>;
  };

  const [audioState, setAudioState] = useState<AudioState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { favorites: {}, progress: {}, listened: {} };
      const parsed = JSON.parse(raw) as Partial<AudioState>;
      return {
        favorites: (parsed.favorites ?? {}) as Record<string, true>,
        progress: (parsed.progress ?? {}) as Record<string, { position: number; duration: number | null; updatedAt: number }>,
        listened: (parsed.listened ?? {}) as Record<string, true>,
      };
    } catch {
      return { favorites: {}, progress: {}, listened: {} };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(audioState));
    } catch {
      /* ignore */
    }
  }, [audioState, storageKey]);

  function toggleFavorite(id: string) {
    setAudioState((s) => {
      const next = { ...s, favorites: { ...s.favorites } };
      if (next.favorites[id]) {
        delete next.favorites[id];
      } else {
        next.favorites[id] = true;
      }
      return next;
    });
  }

  function markListened(id: string) {
    setAudioState((s) => ({ ...s, listened: { ...s.listened, [id]: true } }));
  }

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return episodes;
    return episodes.filter((e) => {
      const hay = `${e.title}\n${e.description ?? ''}`.toLowerCase();
      return hay.includes(t);
    });
  }, [episodes, query]);

  useEffect(() => {
    if (!activeEpisode) return;
    try {
      const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
      if (!ms) return;
      ms.metadata = new MediaMetadata({
        title: activeEpisode.title,
        artist: feed?.title ?? 'Подкаст',
        album: feed?.title ?? undefined,
        artwork: activeEpisode.imageUrl
          ? [{ src: activeEpisode.imageUrl, sizes: '512x512', type: 'image/png' }]
          : undefined,
      });
    } catch {
      /* ignore */
    }
  }, [activeEpisode, feed?.title]);

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

  async function playEpisode(ep: PodcastEpisode) {
    setActiveId(ep.id);
    // Wait a tick so <audio src> updates before play()
    await Promise.resolve();
    const el = audioRef.current;
    if (!el) return;
    try {
      await el.play();
    } catch {
      // Autoplay blocked until user gesture in some browsers — but this is invoked by a click.
    }
  }

  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <header className="bg-primary px-4 py-4 text-white shadow-[0_4px_24px_rgba(125,54,64,0.3)] sm:px-5 sm:py-5 md:rounded-none md:shadow-sm md:px-6 max-md:rounded-b-[1.75rem]">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">Проповеди</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
          Аудио проповеди и удобное управление прослушиванием
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
                    <h2 className="text-base font-extrabold text-stone-900 sm:text-lg md:text-xl">Аудио проповеди</h2>
                    {feed?.description ? (
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
                  {isAdmin ? (
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-stone-100 px-4 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-200 hover:text-stone-900 active:scale-[0.98]"
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
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
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
                    const isActive = activeEpisode?.id === ep.id;
                  const isFav = Boolean(audioState.favorites[ep.id]);
                  const p = audioState.progress[ep.id];
                  const dur = p?.duration ?? null;
                  const pos = p?.position ?? 0;
                  const ratio = dur && dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
                  const listened = Boolean(audioState.listened[ep.id]) || ratio >= 0.98;
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
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200/60">
                              <div className="h-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </div>
                            <span
                              className={[
                                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                                listened ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' : 'bg-stone-50 text-stone-600 ring-1 ring-stone-200/70',
                              ].join(' ')}
                            >
                              {listened ? 'ПРОСЛУШАНО' : ratio > 0 ? `${Math.round(ratio * 100)}%` : 'НОВОЕ'}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void playEpisode(ep)}
                              className={[
                                'inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-extrabold shadow-sm transition',
                                isActive
                                  ? 'bg-primary text-white shadow-primary/25'
                                  : 'bg-stone-900 text-white hover:bg-stone-800',
                              ].join(' ')}
                            >
                              <LuPlay className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                              {isActive ? 'В плеере' : 'Слушать'}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(ep.id)}
                              className={[
                                'inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-extrabold shadow-sm transition',
                                isFav
                                  ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 hover:bg-rose-100'
                                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                              ].join(' ')}
                              aria-pressed={isFav}
                              aria-label={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
                            >
                              <LuHeart className="h-4 w-4" strokeWidth={2} aria-hidden />
                              {isFav ? 'В избранном' : 'В избранное'}
                            </button>
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
                          {ep.description ? (
                            <p className="mt-3 line-clamp-2 text-sm font-medium leading-snug text-stone-600">
                              {ep.description}
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

      {/* Sticky player: keeps playing while browsing (mobile-first). */}
      {activeEpisode ? (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] md:inset-x-6 md:bottom-6">
          <div className="rounded-3xl border border-stone-200/80 bg-white/90 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200/70">
                {activeEpisode.imageUrl ? (
                  <img src={activeEpisode.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-stone-400">
                    <LuHeadphones className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-extrabold text-stone-900">{activeEpisode.title}</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-500">
                  {episodeSubtitle(activeEpisode) || (feed?.title ?? 'Подкаст')}
                </p>
              </div>
              <button
                type="button"
                className={[
                  'inline-flex h-9 items-center justify-center rounded-2xl px-3 text-xs font-extrabold transition',
                  audioState.favorites[activeEpisode.id]
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 hover:bg-rose-100'
                    : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                ].join(' ')}
                onClick={() => toggleFavorite(activeEpisode.id)}
                aria-label="Избранное"
              >
                <LuHeart className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-2xl border border-stone-200 bg-white px-3 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
                onClick={() => setActiveId(null)}
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
                src={activeEpisode.audioUrl}
                onLoadedMetadata={() => {
                  const el = audioRef.current;
                  if (!el) return;
                  const saved = audioState.progress[activeEpisode.id];
                  const savedPos = saved?.position ?? 0;
                  // Seek to saved position if reasonable.
                  if (Number.isFinite(savedPos) && savedPos > 2 && savedPos < el.duration - 2) {
                    try {
                      el.currentTime = savedPos;
                    } catch {
                      /* ignore */
                    }
                  }
                }}
                onTimeUpdate={() => {
                  const el = audioRef.current;
                  if (!el) return;
                  const now = Date.now();
                  // Throttle saves (about every 2 seconds)
                  if (now - saveTickRef.current < 2000) return;
                  saveTickRef.current = now;
                  const position = Number.isFinite(el.currentTime) ? el.currentTime : 0;
                  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
                  setAudioState((s) => ({
                    ...s,
                    progress: {
                      ...s.progress,
                      [activeEpisode.id]: { position, duration, updatedAt: now },
                    },
                  }));
                  if (duration && duration > 0 && position / duration >= 0.98) {
                    markListened(activeEpisode.id);
                  }
                }}
                onEnded={() => {
                  markListened(activeEpisode.id);
                  setAudioState((s) => ({
                    ...s,
                    progress: {
                      ...s.progress,
                      [activeEpisode.id]: { position: 0, duration: s.progress[activeEpisode.id]?.duration ?? null, updatedAt: Date.now() },
                    },
                  }));
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

