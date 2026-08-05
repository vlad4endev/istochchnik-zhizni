import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

import {
  getMessengerAudioSnapshot,
  seekMessengerAudio,
  setMessengerAudioRate,
  subscribeMessengerAudio,
  toggleMessengerAudio,
  type MessengerAudioSnapshot,
} from '../messengerAudioHost';

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

function stopMsgMenu(e: { stopPropagation: () => void; preventDefault?: () => void }) {
  e.stopPropagation();
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
    const envelope = 0.32 + 0.68 * Math.sin(Math.PI * t);
    const wobble = 0.1 * Math.sin(t * Math.PI * 4.2 + (h % 7));
    bars.push(Math.min(1, Math.max(0.16, (0.22 + n * 0.78) * envelope + wobble)));
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const seekingRef = useRef(false);
  const [rate, setRate] = useState<PlaybackRate>(() => readStoredRate());
  const [duration, setDuration] = useState(() =>
    typeof durationHintSec === 'number' && durationHintSec > 0 ? durationHintSec : 0,
  );
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const bars = useMemo(
    () => buildVoiceWaveBars(waveSeed || title || audioSrc || instanceId, variant === 'file' ? 38 : 44),
    [waveSeed, title, audioSrc, instanceId, variant],
  );

  const applySnap = useCallback(
    (snap: MessengerAudioSnapshot) => {
      if (snap.ownerId !== instanceId) {
        setPlaying(false);
        setLoading(false);
        return;
      }
      setPlaying(snap.playing);
      setLoading(snap.loading);
      if (!seekingRef.current) {
        setCurrent(snap.current);
        setProgress(snap.progress);
      }
      if (snap.duration > 0) setDuration(snap.duration);
    },
    [instanceId],
  );

  useEffect(() => subscribeMessengerAudio(applySnap), [applySnap]);

  useEffect(() => {
    if (typeof durationHintSec === 'number' && durationHintSec > 0) {
      setDuration((prev) => (prev > 0 ? prev : durationHintSec));
    }
  }, [durationHintSec]);

  const toggle = useCallback(() => {
    if (!audioSrc) return;
    const snap = getMessengerAudioSnapshot();
    const resumeFrom =
      snap.ownerId === instanceId && snap.current > 0
        ? snap.current
        : current > 0
          ? current
          : undefined;
    toggleMessengerAudio({
      ownerId: instanceId,
      src: audioSrc,
      title: title?.trim() || (variant === 'file' ? 'Аудиофайл' : 'Голосовое сообщение'),
      artist: 'Источник жизни',
      durationHintSec,
      rate,
      startAtSec: resumeFrom,
    });
  }, [audioSrc, current, durationHintSec, instanceId, rate, title, variant]);

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
        const snap = getMessengerAudioSnapshot();
        if (snap.ownerId === instanceId) {
          setMessengerAudioRate(instanceId, next);
        }
        return next;
      });
    },
    [instanceId],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !audioSrc) return;
      const total =
        duration > 0
          ? duration
          : typeof durationHintSec === 'number' && durationHintSec > 0
            ? durationHintSec
            : 0;
      if (!(total > 0)) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      const next = ratio * total;
      setCurrent(next);
      setProgress(ratio);
      seekMessengerAudio(instanceId, next);
    },
    [audioSrc, duration, durationHintSec, instanceId],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!audioSrc) return;
      seekingRef.current = true;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
      const onMove = (ev: PointerEvent) => {
        ev.stopPropagation();
        seekFromClientX(ev.clientX);
      };
      const onUp = (ev: PointerEvent) => {
        ev.stopPropagation();
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
    [seekFromClientX, audioSrc],
  );

  if (!audioSrc) {
    return (
      <span className={['tg-voice-fallback', isMine ? 'tg-voice-fallback--mine' : ''].join(' ')}>
        {variant === 'file' ? 'Аудио недоступно' : 'Голосовое недоступно'}
      </span>
    );
  }

  const total = duration > 0 ? duration : typeof durationHintSec === 'number' ? durationHintSec : 0;
  const timeLeft = playing || current > 0 ? formatVoiceTime(current) : formatVoiceTime(total > 0 ? total : 0);
  const showTitle = variant === 'file' && Boolean(title?.trim());
  const activeBars = Math.round(progress * bars.length);

  return (
    <div
      data-no-msg-menu
      className={[
        'tg-voice-player',
        isMine ? 'tg-voice-player--mine' : 'tg-voice-player--theirs',
        variant === 'file' ? 'tg-voice-player--file' : 'tg-voice-player--voice',
        playing ? 'tg-voice-player--playing' : '',
        loading ? 'tg-voice-player--loading' : '',
      ].join(' ')}
      onPointerDown={stopMsgMenu}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        data-no-msg-menu
        onPointerDown={stopMsgMenu}
        onPointerUp={stopMsgMenu}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        className="tg-voice-play"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        disabled={loading && !playing}
      >
        {playing ? (
          <LuPause size={20} strokeWidth={2.5} aria-hidden />
        ) : (
          <LuPlay size={20} strokeWidth={2.5} className="tg-voice-play__icon" aria-hidden />
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
          data-no-msg-menu
          aria-label="Прогресс воспроизведения"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(total))}
          aria-valuenow={Math.round(current)}
          onPointerDown={onTrackPointerDown}
          onKeyDown={(e) => {
            if (!(total > 0)) return;
            const step = Math.max(1, total * 0.05);
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              seekMessengerAudio(instanceId, Math.min(total, current + step));
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              seekMessengerAudio(instanceId, Math.max(0, current - step));
            } else if (e.key === 'Home') {
              e.preventDefault();
              seekMessengerAudio(instanceId, 0);
            } else if (e.key === 'End') {
              e.preventDefault();
              seekMessengerAudio(instanceId, total);
            } else if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              toggle();
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
          <span className="tg-voice-time">
            {loading && !playing ? 'Загрузка…' : timeLeft}
            {!loading && total > 0 && (playing || current > 0) ? (
              <span className="tg-voice-time--total"> / {formatVoiceTime(total)}</span>
            ) : null}
          </span>
          <button
            type="button"
            data-no-msg-menu
            className={['tg-voice-speed', rate !== 1 ? 'tg-voice-speed--active' : ''].join(' ')}
            onPointerDown={stopMsgMenu}
            onClick={cycleRate}
            aria-label={`Скорость ${formatRate(rate)}. Нажмите, чтобы изменить`}
            title="Скорость"
          >
            {formatRate(rate)}
          </button>
        </div>
      </div>
    </div>
  );
}
