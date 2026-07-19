import { useEffect, useRef, useState } from 'react';
import {
  LuChevronsDown,
  LuChevronsLeft,
  LuChevronsRight,
  LuHeadphones,
  LuHeart,
  LuPause,
  LuPlay,
  LuX,
} from 'react-icons/lu';

import { parseEpisodeTitle } from '../utils/sermonEpisodeDisplay';
import { useSermonPlayback } from './SermonPlaybackContext';

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SKIP_SECONDS = 15;

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function nextRate(current: number): number {
  const idx = RATES.findIndex((r) => Math.abs(r - current) < 0.01);
  return RATES[(idx + 1) % RATES.length] ?? 1;
}

export function SermonPlayer() {
  const {
    session,
    audioState,
    isPlaying,
    expanded,
    setExpanded,
    closePlayer,
    toggleFavorite,
    markListened,
    saveProgress,
    setIsPlaying,
    audioRef,
    requestPlayToken,
  } = useSermonPlayback();

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [seeking, setSeeking] = useState(false);
  const saveTickRef = useRef(0);
  const scrubRef = useRef<HTMLInputElement | null>(null);

  const episode = session?.episode ?? null;
  const feedTitle = session?.feedTitle ?? null;
  const parsed = episode ? parseEpisodeTitle(episode.title) : null;
  const isFav = episode ? Boolean(audioState.favorites[episode.id]) : false;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  useEffect(() => {
    setPosition(0);
    setDuration(episode?.duration && episode.duration > 0 ? episode.duration : 0);
    setRate(1);
    setSeeking(false);
    const el = audioRef.current;
    if (el) el.playbackRate = 1;
  }, [episode?.id, episode?.duration, audioRef]);

  useEffect(() => {
    if (!episode) return;
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => {
      if (seeking) return;
      const pos = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      setPosition(pos);
      if (dur > 0) setDuration(dur);

      const now = Date.now();
      if (now - saveTickRef.current < 2000) return;
      saveTickRef.current = now;
      saveProgress(episode.id, pos, dur > 0 ? dur : null);
      if (dur > 0 && pos / dur >= 0.98) markListened(episode.id);
    };
    const onMeta = () => {
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (dur > 0) setDuration(dur);
      const saved = audioState.progress[episode.id];
      const savedPos = saved?.position ?? 0;
      if (Number.isFinite(savedPos) && savedPos > 2 && dur > 0 && savedPos < dur - 2) {
        try {
          el.currentTime = savedPos;
          setPosition(savedPos);
        } catch {
          /* ignore */
        }
      }
    };
    const onEnded = () => {
      markListened(episode.id);
      saveProgress(episode.id, 0, Number.isFinite(el.duration) ? el.duration : null);
      setIsPlaying(false);
      setPosition(0);
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
    };
    // audioState.progress intentionally omitted — only seed on episode change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, audioRef, markListened, saveProgress, setIsPlaying, seeking]);

  useEffect(() => {
    if (!episode || requestPlayToken <= 0) return;
    const el = audioRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* gesture / load race */
    });
  }, [episode?.id, requestPlayToken, audioRef, episode]);

  useEffect(() => {
    if (!episode) return;
    try {
      const ms = navigator.mediaSession;
      if (!ms) return;
      const { topic, author } = parseEpisodeTitle(episode.title);
      ms.metadata = new MediaMetadata({
        title: topic,
        artist: author ?? feedTitle ?? 'Проповеди',
        album: feedTitle ?? undefined,
        artwork: episode.imageUrl
          ? [
              { src: episode.imageUrl, sizes: '96x96', type: 'image/png' },
              { src: episode.imageUrl, sizes: '256x256', type: 'image/png' },
              { src: episode.imageUrl, sizes: '512x512', type: 'image/png' },
            ]
          : undefined,
      });
      ms.playbackState = isPlaying ? 'playing' : 'paused';

      const el = audioRef.current;
      const seekBy = (delta: number) => {
        if (!el) return;
        el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
        setPosition(el.currentTime);
      };

      ms.setActionHandler('play', () => {
        void el?.play();
      });
      ms.setActionHandler('pause', () => {
        el?.pause();
      });
      ms.setActionHandler('stop', () => {
        closePlayer();
      });
      ms.setActionHandler('seekbackward', (details) => {
        seekBy(-(details.seekOffset ?? SKIP_SECONDS));
      });
      ms.setActionHandler('seekforward', (details) => {
        seekBy(details.seekOffset ?? SKIP_SECONDS);
      });
      ms.setActionHandler('seekto', (details) => {
        if (!el || details.seekTime == null) return;
        el.currentTime = details.seekTime;
        setPosition(details.seekTime);
      });

      if (duration > 0 && Number.isFinite(position)) {
        try {
          ms.setPositionState({
            duration,
            playbackRate: rate,
            position: Math.min(position, duration),
          });
        } catch {
          /* some browsers reject rapid updates */
        }
      }

      return () => {
        try {
          ms.setActionHandler('play', null);
          ms.setActionHandler('pause', null);
          ms.setActionHandler('stop', null);
          ms.setActionHandler('seekbackward', null);
          ms.setActionHandler('seekforward', null);
          ms.setActionHandler('seekto', null);
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* Media Session unavailable */
    }
  }, [episode, feedTitle, isPlaying, position, duration, rate, closePlayer, audioRef]);

  if (!episode || !parsed) return null;

  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        /* ignore */
      }
    } else {
      el.pause();
    }
  }

  function skip(delta: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
    setPosition(el.currentTime);
  }

  function cycleRate() {
    const el = audioRef.current;
    const next = nextRate(rate);
    setRate(next);
    if (el) el.playbackRate = next;
  }

  function onScrubInput(value: number) {
    setSeeking(true);
    setPosition(value);
  }

  function onScrubCommit(value: number) {
    const el = audioRef.current;
    if (el) el.currentTime = value;
    setPosition(value);
    setSeeking(false);
    if (episode) saveProgress(episode.id, value, duration > 0 ? duration : null);
  }

  const subtitle = parsed.author
    ? parsed.author
    : feedTitle ?? 'Проповедь';

  return (
    <>
      <audio
        ref={(el) => {
          audioRef.current = el;
        }}
        src={episode.audioUrl}
        preload="metadata"
        playsInline
        className="hidden"
      />

      {expanded ? (
        <button
          type="button"
          className="fixed inset-0 z-[70] bg-stone-950/45 backdrop-blur-[2px]"
          aria-label="Свернуть плеер"
          onClick={() => setExpanded(false)}
        />
      ) : null}

      <div
        className={[
          'fixed inset-x-0 z-[80] px-3 transition-[bottom,transform] duration-300 ease-out lg:inset-x-auto lg:left-1/2 lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:px-6',
          'bottom-[calc(var(--app-bottom-nav-total-height)+0.5rem)] lg:bottom-6',
        ].join(' ')}
      >
        <div
          className={[
            'overflow-hidden rounded-[1.75rem] border border-white/10 shadow-[0_20px_60px_rgba(28,25,23,0.35)]',
            'bg-[linear-gradient(165deg,color-mix(in_srgb,var(--primary)_92%,#1c1917)_0%,#1c1917_55%,#0c0a09_100%)]',
            'text-white',
            expanded ? 'p-4 sm:p-5' : 'p-3',
          ].join(' ')}
          role="region"
          aria-label="Плеер проповеди"
        >
          {!expanded ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/15"
                aria-label="Развернуть плеер"
              >
                {episode.imageUrl ? (
                  <img src={episode.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-white/60">
                    <LuHeadphones className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                  </div>
                )}
                {isPlaying ? (
                  <span className="pointer-events-none absolute inset-x-1 bottom-1 flex h-1 items-end justify-center gap-0.5">
                    <span className="sermon-eq-bar h-full w-0.5 rounded-full bg-white/90" />
                    <span className="sermon-eq-bar sermon-eq-bar-delay h-full w-0.5 rounded-full bg-white/90" />
                    <span className="sermon-eq-bar sermon-eq-bar-delay-2 h-full w-0.5 rounded-full bg-white/90" />
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-[13px] font-extrabold leading-tight">{parsed.topic}</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-white/65">{subtitle}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-white transition-[width] duration-150"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() => void togglePlay()}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--primary-dark)] shadow-lg shadow-black/25 transition active:scale-95"
                aria-label={isPlaying ? 'Пауза' : 'Слушать'}
              >
                {isPlaying ? (
                  <LuPause className="h-5 w-5" strokeWidth={2.4} aria-hidden />
                ) : (
                  <LuPlay className="ml-0.5 h-5 w-5" strokeWidth={2.4} aria-hidden />
                )}
              </button>

              <button
                type="button"
                onClick={closePlayer}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/10 hover:bg-white/15"
                aria-label="Закрыть плеер"
              >
                <LuX className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/15 sm:h-24 sm:w-24">
                  {episode.imageUrl ? (
                    <img src={episode.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-white/55">
                      <LuHeadphones className="h-8 w-8" strokeWidth={1.6} aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="line-clamp-2 text-[15px] font-extrabold leading-snug sm:text-base">
                    {parsed.topic}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-white/65">{subtitle}</p>
                  {feedTitle && parsed.author ? (
                    <p className="mt-0.5 truncate text-[11px] font-medium text-white/45">{feedTitle}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15"
                    aria-label="Свернуть"
                  >
                    <LuChevronsDown className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={closePlayer}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15"
                    aria-label="Закрыть плеер"
                  >
                    <LuX className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </div>

              <div>
                <label className="sr-only" htmlFor="sermon-scrubber">
                  Позиция воспроизведения
                </label>
                <input
                  id="sermon-scrubber"
                  ref={scrubRef}
                  type="range"
                  min={0}
                  max={duration > 0 ? duration : 1}
                  step={0.25}
                  value={Math.min(position, duration || 1)}
                  disabled={duration <= 0}
                  onChange={(e) => onScrubInput(Number(e.target.value))}
                  onPointerUp={(e) => onScrubCommit(Number((e.target as HTMLInputElement).value))}
                  onKeyUp={(e) => onScrubCommit(Number((e.target as HTMLInputElement).value))}
                  className="sermon-scrubber w-full"
                  style={{ ['--scrub-pct' as string]: `${ratio * 100}%` }}
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold tabular-nums text-white/60">
                  <span>{formatClock(position)}</span>
                  <span>{formatClock(duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleFavorite(episode.id)}
                  className={[
                    'inline-flex h-11 w-11 items-center justify-center rounded-2xl transition',
                    isFav ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-300/40' : 'bg-white/10 text-white/80 ring-1 ring-white/10',
                  ].join(' ')}
                  aria-label={isFav ? 'Убрать из избранного' : 'В избранное'}
                  aria-pressed={isFav}
                >
                  <LuHeart className={['h-5 w-5', isFav ? 'fill-current' : ''].join(' ')} strokeWidth={2} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => skip(-SKIP_SECONDS)}
                  className="inline-flex h-12 min-w-[3.25rem] flex-col items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10 active:scale-95"
                  aria-label={`Назад на ${SKIP_SECONDS} секунд`}
                >
                  <LuChevronsLeft className="h-5 w-5" strokeWidth={2.2} aria-hidden />
                  <span className="text-[10px] font-extrabold leading-none">{SKIP_SECONDS}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--primary-dark)] shadow-xl shadow-black/30 transition active:scale-95"
                  aria-label={isPlaying ? 'Пауза' : 'Слушать'}
                >
                  {isPlaying ? (
                    <LuPause className="h-7 w-7" strokeWidth={2.3} aria-hidden />
                  ) : (
                    <LuPlay className="ml-0.5 h-7 w-7" strokeWidth={2.3} aria-hidden />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => skip(SKIP_SECONDS)}
                  className="inline-flex h-12 min-w-[3.25rem] flex-col items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10 active:scale-95"
                  aria-label={`Вперёд на ${SKIP_SECONDS} секунд`}
                >
                  <LuChevronsRight className="h-5 w-5" strokeWidth={2.2} aria-hidden />
                  <span className="text-[10px] font-extrabold leading-none">{SKIP_SECONDS}</span>
                </button>

                <button
                  type="button"
                  onClick={cycleRate}
                  className="inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-2xl bg-white/10 px-2 text-xs font-extrabold tabular-nums text-white ring-1 ring-white/10"
                  aria-label={`Скорость ${rate}x`}
                  title="Скорость воспроизведения"
                >
                  {rate % 1 === 0 ? `${rate}×` : `${rate}×`}
                </button>
              </div>

              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Управление с экрана блокировки · продолжается в фоне
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes sermon-eq {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        .sermon-eq-bar {
          transform-origin: bottom;
          animation: sermon-eq 0.7s ease-in-out infinite;
        }
        .sermon-eq-bar-delay { animation-delay: 0.15s; }
        .sermon-eq-bar-delay-2 { animation-delay: 0.3s; }
        .sermon-scrubber {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            #fff 0%,
            #fff var(--scrub-pct, 0%),
            rgba(255,255,255,0.2) var(--scrub-pct, 0%),
            rgba(255,255,255,0.2) 100%
          );
          outline: none;
          cursor: pointer;
        }
        .sermon-scrubber::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          border: 0;
        }
        .sermon-scrubber::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          border: 0;
        }
      `}</style>
    </>
  );
}
