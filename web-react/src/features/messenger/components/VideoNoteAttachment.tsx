import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LuPause, LuPlay } from 'react-icons/lu';

/**
 * Видеокружок как в Telegram: без рамки «карточки», тап — плей/пауза, мета (время, галочки) в оверлее.
 */
export function VideoNoteAttachment({
  videoSrc,
  videoFallbackSrc,
  primaryMimeType,
  isMine,
  durationHintSec,
  metaOverlay,
}: {
  videoSrc: string | null;
  videoFallbackSrc?: string | null;
  primaryMimeType?: string;
  isMine: boolean;
  /** Длительность с сервера/оптимистичного payload (сек), пока нет metadata у видео. */
  durationHintSec?: number;
  /** Время + статус доставки (как в Telegram — внизу круга). */
  metaOverlay: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeSrc, setActiveSrc] = useState<string | null>(videoSrc);
  const [usedFallback, setUsedFallback] = useState(false);
  const primaryMime = String(primaryMimeType ?? '').trim().toLowerCase();

  useEffect(() => {
    setActiveSrc(videoSrc);
    setUsedFallback(false);
    setProgress(0);
    setPlaying(false);
  }, [videoSrc, videoFallbackSrc]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
        setProgress(el.currentTime / el.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(1);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [videoSrc]);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = videoRef.current;
      if (!el || !activeSrc) return;
      if (playing) el.pause();
      else {
        const trySwitchToFallback = () => {
          if (!usedFallback && videoFallbackSrc && videoFallbackSrc !== activeSrc) {
            setUsedFallback(true);
            setActiveSrc(videoFallbackSrc);
            return true;
          }
          return false;
        };
        if (el.duration && Number.isFinite(el.duration) && el.currentTime >= el.duration - 0.05) {
          el.currentTime = 0;
        }
        void el.play().catch(() => {
          if (trySwitchToFallback()) return;
        });
      }
    },
    [activeSrc, playing, usedFallback, videoFallbackSrc],
  );

  if (!activeSrc) {
    return (
      <div
        className="msg-videonote-circle msg-videonote-circle--placeholder"
        role="status"
        aria-label={
          typeof durationHintSec === 'number' && durationHintSec > 0
            ? `Загрузка видеосообщения, ~${Math.round(durationHintSec)} с`
            : isMine
              ? 'Загрузка вашего видеосообщения'
              : 'Загрузка видеосообщения'
        }
      >
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Видео…
        </span>
      </div>
    );
  }

  return (
    <div className="msg-videonote-circle-wrap">
      <button
        type="button"
        className="msg-videonote-circle group relative block overflow-hidden rounded-full border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Воспроизвести видеосообщение'}
      >
        <video
          ref={videoRef}
          src={activeSrc}
          className="msg-videonote-video"
          playsInline
          preload="auto"
          muted={false}
          onError={() => {
            if (!usedFallback && videoFallbackSrc && videoFallbackSrc !== activeSrc) {
              setUsedFallback(true);
              setActiveSrc(videoFallbackSrc);
            }
          }}
        >
          {activeSrc === videoSrc && videoSrc ? (
            <source src={videoSrc} type={primaryMime || undefined} />
          ) : null}
          {videoFallbackSrc && videoFallbackSrc !== videoSrc ? (
            <source src={videoFallbackSrc} type="video/mp4" />
          ) : null}
        </video>
        {!playing ? (
          <span className="msg-videonote-play-veil" aria-hidden>
            <span className="msg-videonote-play-btn">
              <LuPlay className="ml-0.5 h-10 w-10 text-white drop-shadow-md" strokeWidth={2} aria-hidden />
            </span>
          </span>
        ) : (
          <span className="msg-videonote-pause-hit" aria-hidden>
            <span className="msg-videonote-pause-icon opacity-0 transition-opacity group-active:opacity-100">
              <LuPause className="h-9 w-9 text-white/95 drop-shadow" strokeWidth={2} aria-hidden />
            </span>
          </span>
        )}
        <span className="msg-videonote-progress-track" aria-hidden>
          <span className="msg-videonote-progress-fill" style={{ width: `${Math.max(1, Math.round(progress * 100))}%` }} />
        </span>
        {metaOverlay ? <span className="msg-videonote-meta-overlay">{metaOverlay}</span> : null}
      </button>
    </div>
  );
}
