import { useCallback, useEffect, useRef, useState } from 'react';
import { LuPause, LuPlay, LuSkipForward, LuX } from 'react-icons/lu';

import {
  getMessengerAudioSnapshot,
  pauseMessengerAudio,
  playActiveMessengerAudio,
  playNextMessengerAudio,
  seekActiveMessengerAudio,
  setActiveMessengerAudioRate,
  stopMessengerAudio,
  subscribeMessengerAudio,
  type MessengerAudioSnapshot,
} from '../messengerAudioHost';

const PLAYBACK_RATES = [1, 1.5, 2] as const;
type PlaybackRate = (typeof PLAYBACK_RATES)[number];

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatRate(rate: number): string {
  return `${rate}×`;
}

function toPlaybackRate(rate: number): PlaybackRate {
  if (PLAYBACK_RATES.includes(rate as PlaybackRate)) return rate as PlaybackRate;
  return 1;
}

/**
 * Липкая панель над композером: текущее голосовое/аудио, seek, скорость, следующее.
 * Видна только пока в этом чате играет (или на паузе) зарегистрированный трек.
 */
export function MessengerMiniPlayer({ conversationId }: { conversationId: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [snap, setSnap] = useState<MessengerAudioSnapshot>(() => getMessengerAudioSnapshot());

  useEffect(() => subscribeMessengerAudio(setSnap), []);

  const visible =
    Boolean(snap.ownerId) &&
    snap.conversationId === conversationId &&
    (snap.playing || snap.loading || snap.current > 0 || snap.progress > 0);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !(snap.duration > 0)) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      seekActiveMessengerAudio(ratio * snap.duration);
    },
    [snap.duration],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!(snap.duration > 0)) return;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
      const onMove = (ev: PointerEvent) => {
        ev.stopPropagation();
        seekFromClientX(ev.clientX);
      };
      const onUp = (ev: PointerEvent) => {
        ev.stopPropagation();
        seekFromClientX(ev.clientX);
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [seekFromClientX, snap.duration],
  );

  const cycleRate = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = toPlaybackRate(snap.rate);
      const idx = PLAYBACK_RATES.indexOf(cur);
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length] ?? 1;
      setActiveMessengerAudioRate(next);
    },
    [snap.rate],
  );

  if (!visible) return null;

  const title =
    (snap.title && snap.title.trim()) ||
    (snap.variant === 'file' ? 'Аудиофайл' : 'Голосовое сообщение');
  const total = snap.duration > 0 ? snap.duration : 0;
  const progressPct = Math.min(100, Math.max(0, snap.progress * 100));

  return (
    <div className="tg-mini-player" role="region" aria-label="Сейчас играет">
      <button
        type="button"
        className="tg-mini-player__play"
        aria-label={snap.playing ? 'Пауза' : 'Воспроизвести'}
        disabled={snap.loading && !snap.playing}
        onClick={() => {
          if (snap.playing) pauseMessengerAudio();
          else playActiveMessengerAudio();
        }}
      >
        {snap.playing ? (
          <LuPause size={18} strokeWidth={2.5} aria-hidden />
        ) : (
          <LuPlay size={18} strokeWidth={2.5} className="tg-mini-player__play-icon" aria-hidden />
        )}
      </button>

      <div className="tg-mini-player__body">
        <div className="tg-mini-player__row">
          <p className="tg-mini-player__title" title={title}>
            {snap.loading && !snap.playing ? 'Загрузка…' : title}
          </p>
          <button
            type="button"
            className={[
              'tg-mini-player__rate',
              toPlaybackRate(snap.rate) !== 1 ? 'tg-mini-player__rate--active' : '',
            ].join(' ')}
            onClick={cycleRate}
            aria-label={`Скорость ${formatRate(toPlaybackRate(snap.rate))}`}
            title="Скорость"
          >
            {formatRate(toPlaybackRate(snap.rate))}
          </button>
        </div>

        <div
          ref={trackRef}
          className="tg-mini-player__seek"
          role="slider"
          tabIndex={0}
          aria-label="Прогресс"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(total))}
          aria-valuenow={Math.round(snap.current)}
          onPointerDown={onTrackPointerDown}
        >
          <div className="tg-mini-player__seek-track">
            <div className="tg-mini-player__seek-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="tg-mini-player__meta">
          <span className="tg-mini-player__time">
            {formatTime(snap.current)}
            {total > 0 ? (
              <span className="tg-mini-player__time-total"> / {formatTime(total)}</span>
            ) : null}
          </span>
        </div>
      </div>

      {snap.hasNext ? (
        <button
          type="button"
          className="tg-mini-player__next"
          aria-label="Следующее"
          title="Следующее"
          onClick={() => {
            playNextMessengerAudio();
          }}
        >
          <LuSkipForward size={18} strokeWidth={2.4} aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        className="tg-mini-player__close"
        aria-label="Остановить"
        title="Остановить"
        onClick={() => stopMessengerAudio()}
      >
        <LuX size={16} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
