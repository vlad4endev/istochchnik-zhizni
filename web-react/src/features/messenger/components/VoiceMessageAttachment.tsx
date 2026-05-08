import { useCallback, useEffect, useRef, useState } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

import { useAuthenticatedApiBlobSrc } from '../../../lib/useAuthenticatedApiBlobSrc';

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
}: {
  audioSrc: string | null;
  isMine: boolean;
  /** Секунды, переданные с клиента при отправке (пока нет метаданных у &lt;audio&gt;). */
  durationHintSec?: number;
}) {
  const streamSrc = useAuthenticatedApiBlobSrc(audioSrc);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      setCurrent(el.currentTime);
      if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
        setProgress(el.currentTime / el.duration);
      }
    };
    const onPlay = () => setPlaying(true);
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
  }, [streamSrc]);

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

  const awaitingAttachmentBlob =
    typeof audioSrc === 'string' &&
    audioSrc.includes('/attachment-file') &&
    streamSrc == null;

  if (!audioSrc) {
    return (
      <span className={['text-sm font-medium', isMine ? 'text-white/75' : 'text-[var(--text-secondary)]'].join(' ')}>
        Голосовое недоступно
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
  const label = formatVoiceTime(playing ? current : total > 0 ? total : current);

  const barBg = isMine ? 'bg-white/25' : 'bg-[var(--surface)]';
  const barFill = isMine ? 'bg-white' : 'bg-primary';

  return (
    <div className="flex min-w-[200px] max-w-[min(85vw,280px)] items-center gap-2.5">
      <audio ref={audioRef} src={streamSrc ?? undefined} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={[
          'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform active:scale-[0.97]',
          isMine ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-primary/12 text-primary ring-1 ring-primary/20',
        ].join(' ')}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? <LuPause size={20} strokeWidth={2.25} aria-hidden /> : <LuPlay size={20} strokeWidth={2.25} className="ml-0.5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={['relative h-1.5 overflow-hidden rounded-full', barBg].join(' ')} aria-hidden>
          <div className={['absolute inset-y-0 left-0 rounded-full transition-[width]', barFill].join(' ')} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div
          className={['mt-1 tabular-nums text-xs font-semibold', isMine ? 'text-white/80' : 'text-[var(--text-muted)]'].join(
            ' ',
          )}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
