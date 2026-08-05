import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

import { useAuthenticatedApiBlobSrc } from '../../../lib/useAuthenticatedApiBlobSrc';

const MESSENGER_AUDIO_PLAY_EVENT = 'messenger-audio-play';

function formatVoiceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function VoiceMessageAttachment({
  audioSrc,
  isMine,
  durationHintSec,
  title,
  variant = 'voice',
}: {
  audioSrc: string | null;
  isMine: boolean;
  /** Секунды, переданные с клиента при отправке (пока нет метаданных у &lt;audio&gt;). */
  durationHintSec?: number;
  /** Название аудиофайла (для вложений с диска). */
  title?: string;
  /** Голосовое с микрофона или загруженный аудиофайл. */
  variant?: 'voice' | 'file';
}) {
  const instanceId = useId();
  const streamSrc = useAuthenticatedApiBlobSrc(audioSrc);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(() =>
    typeof durationHintSec === 'number' && durationHintSec > 0 ? durationHintSec : 0,
  );
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);

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

  const seekFromClientX = useCallback((clientX: number) => {
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
    el.currentTime = next;
    setCurrent(next);
    setProgress(ratio);
  }, [durationHintSec]);

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
        target.releasePointerCapture(ev.pointerId);
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

  const awaitingAttachmentBlob =
    typeof audioSrc === 'string' &&
    audioSrc.includes('/attachment-file') &&
    streamSrc == null;

  if (!audioSrc) {
    return (
      <span className={['text-sm font-medium', isMine ? 'text-white/75' : 'text-[var(--text-secondary)]'].join(' ')}>
        {variant === 'file' ? 'Аудио недоступно' : 'Голосовое недоступно'}
      </span>
    );
  }

  if (awaitingAttachmentBlob) {
    return (
      <span className={['text-sm font-medium', isMine ? 'text-white/75' : 'text-[var(--text-secondary)]'].join(' ')}>
        Загрузка…
      </span>
    );
  }

  const total = duration > 0 ? duration : typeof durationHintSec === 'number' ? durationHintSec : 0;
  const timeLabel =
    playing || current > 0
      ? `${formatVoiceTime(current)}${total > 0 ? ` / ${formatVoiceTime(total)}` : ''}`
      : formatVoiceTime(total > 0 ? total : 0);
  const showTitle = variant === 'file' && Boolean(title?.trim());

  const barBg = isMine ? 'bg-white/25' : 'bg-[var(--surface)]';
  const barFill = isMine ? 'bg-white' : 'bg-primary';
  const knob = isMine ? 'bg-white' : 'bg-primary';

  return (
    <div
      className={[
        'flex items-center gap-2.5',
        variant === 'file' ? 'min-w-[220px] max-w-[min(88vw,300px)]' : 'min-w-[200px] max-w-[min(85vw,280px)]',
      ].join(' ')}
    >
      <audio ref={audioRef} src={streamSrc ?? undefined} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={[
          'grid shrink-0 place-items-center rounded-full transition-transform active:scale-[0.97]',
          variant === 'file' ? 'h-11 w-11' : 'h-10 w-10',
          isMine ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-primary/12 text-primary ring-1 ring-primary/20',
        ].join(' ')}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? (
          <LuPause size={20} strokeWidth={2.25} aria-hidden />
        ) : (
          <LuPlay size={20} strokeWidth={2.25} className="ml-0.5" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1">
        {showTitle ? (
          <p
            className={[
              'mb-1 truncate text-sm font-semibold leading-tight',
              isMine ? 'text-white' : 'text-[var(--text)]',
            ].join(' ')}
            title={title}
          >
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
          className={[
            'relative cursor-pointer touch-none overflow-visible rounded-full',
            variant === 'file' ? 'h-2' : 'h-1.5',
            barBg,
          ].join(' ')}
        >
          <div
            className={['absolute inset-y-0 left-0 rounded-full transition-[width]', barFill].join(' ')}
            style={{ width: `${Math.round(progress * 100)}%` }}
            aria-hidden
          />
          <span
            className={[
              'absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full shadow-sm transition-opacity',
              knob,
              playing || progress > 0 ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
            style={{ left: `calc(${Math.round(progress * 100)}% - 6px)` }}
            aria-hidden
          />
        </div>
        <div
          className={[
            'mt-1 tabular-nums text-xs font-semibold',
            isMine ? 'text-white/80' : 'text-[var(--text-muted)]',
          ].join(' ')}
        >
          {timeLabel}
        </div>
      </div>
    </div>
  );
}
