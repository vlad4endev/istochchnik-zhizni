import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

import { useAuthenticatedApiBlobSrc } from '../../../lib/useAuthenticatedApiBlobSrc';

const MESSENGER_AUDIO_PLAY_EVENT = 'messenger-audio-play';
const VOICE_RATE_KEY = 'messenger-voice-playback-rate';
const PLAYBACK_RATES = [1, 1.5, 2] as const;
type PlaybackRate = (typeof PLAYBACK_RATES)[number];

function formatVoiceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}×` : `${rate}×`;
}

function readStoredRate(): PlaybackRate {
  try {
    const raw = Number(sessionStorage.getItem(VOICE_RATE_KEY));
    if (PLAYBACK_RATES.includes(raw as PlaybackRate)) return raw as PlaybackRate;
  } catch {
    /* ignore */
  }
  return 1;
}

/** Детерминированная «волна» без декодирования аудио — стабильна для одного сообщения. */
export function buildVoiceWaveBars(seed: string, count = 40): number[] {
  let h = 2166136261;
  const src = String(seed || 'voice');
  for (let i = 0; i < src.length; i += 1) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const n = ((h >>> 0) % 1000) / 1000;
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const envelope = 0.28 + 0.72 * Math.sin(Math.PI * t);
    const wobble = 0.12 * Math.sin(t * Math.PI * 5 + (h % 7));
    bars.push(Math.min(1, Math.max(0.14, (0.2 + n * 0.8) * envelope + wobble)));
  }
  return bars;
}

export function VoiceMessageAttachment({
  audioSrc,
  isMine,
  durationHintSec,
  title,
  variant = 'voice',
  waveSeed,
}: {
  audioSrc: string | null;
  isMine: boolean;
  /** Секунды, переданные с клиента при отправке (пока нет метаданных у &lt;audio&gt;). */
  durationHintSec?: number;
  /** Название аудиофайла (для вложений с диска). */
  title?: string;
  /** Голосовое с микрофона или загруженный аудиофайл. */
  variant?: 'voice' | 'file';
  /** Семя для стабильной волны (обычно id сообщения). */
  waveSeed?: string;
}) {
  const instanceId = useId();
  const needsAuthBlob =
    typeof audioSrc === 'string' && audioSrc.includes('/attachment-file');
  const authBlobSrc = useAuthenticatedApiBlobSrc(needsAuthBlob ? audioSrc : null);
  const streamSrc = needsAuthBlob ? authBlobSrc : audioSrc;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(() => readStoredRate());
  const [duration, setDuration] = useState(() =>
    typeof durationHintSec === 'number' && durationHintSec > 0 ? durationHintSec : 0,
  );
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);

  const bars = useMemo(
    () => buildVoiceWaveBars(waveSeed || title || audioSrc || instanceId, variant === 'file' ? 36 : 42),
    [waveSeed, title, audioSrc, instanceId, variant],
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate, streamSrc]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => {
      if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };
    const onTime = () => {
      if (seekingRef.current) return;
      setCurrent(el.currentTime);
      if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
        setProgress(el.currentTime / el.duration);
      }
    };
    const onPlay = () => {
      setPlaying(true);
      window.dispatchEvent(
        new CustomEvent(MESSENGER_AUDIO_PLAY_EVENT, { detail: { id: instanceId } }),
      );
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      setProgress(0);
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [streamSrc, instanceId]);

  useEffect(() => {
    const onOtherPlay = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id || detail.id === instanceId) return;
      const el = audioRef.current;
      if (el && !el.paused) el.pause();
    };
    window.addEventListener(MESSENGER_AUDIO_PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(MESSENGER_AUDIO_PLAY_EVENT, onOtherPlay);
  }, [instanceId]);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = audioRef.current;
      if (!el || !streamSrc) return;
      if (playing) el.pause();
      else void el.play().catch(() => {});
    },
    [streamSrc, playing],
  );

  const cycleRate = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setRate((prev) => {
        const idx = PLAYBACK_RATES.indexOf(prev);
        const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length] ?? 1;
        try {
          sessionStorage.setItem(VOICE_RATE_KEY, String(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = audioRef.current;
      const track = trackRef.current;
      if (!el || !track) return;
      const total =
        el.duration && Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : typeof durationHintSec === 'number' && durationHintSec > 0
            ? durationHintSec
            : 0;
      if (!(total > 0)) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      const next = ratio * total;
      try {
        el.currentTime = next;
      } catch {
        /* ignore seek errors before metadata */
      }
      setCurrent(next);
      setProgress(ratio);
    },
    [durationHintSec],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!streamSrc) return;
      seekingRef.current = true;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
      const onMove = (ev: PointerEvent) => seekFromClientX(ev.clientX);
      const onUp = (ev: PointerEvent) => {
        seekingRef.current = false;
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
    [seekFromClientX, streamSrc],
  );

  const awaitingAttachmentBlob = needsAuthBlob && streamSrc == null;

  if (!audioSrc) {
    return (
      <span className={['tg-voice-fallback', isMine ? 'tg-voice-fallback--mine' : ''].join(' ')}>
        {variant === 'file' ? 'Аудио недоступно' : 'Голосовое недоступно'}
      </span>
    );
  }

  if (awaitingAttachmentBlob) {
    return (
      <div className={['tg-voice-player', isMine ? 'tg-voice-player--mine' : 'tg-voice-player--theirs', 'tg-voice-player--loading'].join(' ')}>
        <span className="tg-voice-play tg-voice-play--ghost" aria-hidden />
        <div className="tg-voice-body">
          <div className="tg-voice-wave tg-voice-wave--skeleton" aria-hidden>
            {bars.map((h, i) => (
              <span key={i} className="tg-voice-bar" style={{ height: `${Math.round(h * 100)}%` }} />
            ))}
          </div>
          <div className="tg-voice-meta">
            <span>Загрузка…</span>
          </div>
        </div>
      </div>
    );
  }

  const total = duration > 0 ? duration : typeof durationHintSec === 'number' ? durationHintSec : 0;
  const timeLeft = playing || current > 0 ? formatVoiceTime(current) : formatVoiceTime(total > 0 ? total : 0);
  const showTitle = variant === 'file' && Boolean(title?.trim());
  const activeBars = Math.round(progress * bars.length);

  return (
    <div
      className={[
        'tg-voice-player',
        isMine ? 'tg-voice-player--mine' : 'tg-voice-player--theirs',
        variant === 'file' ? 'tg-voice-player--file' : 'tg-voice-player--voice',
        playing ? 'tg-voice-player--playing' : '',
      ].join(' ')}
    >
      <audio ref={audioRef} src={streamSrc ?? undefined} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="tg-voice-play"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? (
          <LuPause size={22} strokeWidth={2.4} aria-hidden />
        ) : (
          <LuPlay size={22} strokeWidth={2.4} className="tg-voice-play__icon" aria-hidden />
        )}
      </button>

      <div className="tg-voice-body">
        {showTitle ? (
          <p className="tg-voice-title" title={title}>
            {title}
          </p>
        ) : null}

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Прогресс воспроизведения"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(total))}
          aria-valuenow={Math.round(current)}
          onPointerDown={onTrackPointerDown}
          onKeyDown={(e) => {
            const el = audioRef.current;
            if (!el || !(total > 0)) return;
            const step = Math.max(1, total * 0.05);
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              el.currentTime = Math.min(total, el.currentTime + step);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              el.currentTime = Math.max(0, el.currentTime - step);
            } else if (e.key === 'Home') {
              e.preventDefault();
              el.currentTime = 0;
            } else if (e.key === 'End') {
              e.preventDefault();
              el.currentTime = total;
            }
          }}
          className="tg-voice-wave"
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className={['tg-voice-bar', i < activeBars ? 'tg-voice-bar--played' : ''].join(' ')}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
        </div>

        <div className="tg-voice-meta">
          <span className="tg-voice-time">{timeLeft}</span>
          {total > 0 && (playing || current > 0) ? (
            <span className="tg-voice-time tg-voice-time--total">/ {formatVoiceTime(total)}</span>
          ) : null}
          <button
            type="button"
            className={['tg-voice-speed', rate !== 1 ? 'tg-voice-speed--active' : ''].join(' ')}
            onClick={cycleRate}
            aria-label={`Скорость ${formatRate(rate)}. Нажмите, чтобы изменить`}
            title="Скорость воспроизведения"
          >
            {formatRate(rate)}
          </button>
        </div>
      </div>
    </div>
  );
}
