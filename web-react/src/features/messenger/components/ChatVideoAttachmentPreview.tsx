import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { LuPlay } from 'react-icons/lu';

import { formatMessengerVideoDuration } from '../payloadMedia';

/**
 * Превью вложенного видео в ленте чата: кадр + оверлей как в Telegram (play, длительность).
 */
export function ChatVideoAttachmentPreview({
  src,
  isMine,
  onLoaded,
  onError,
  durationHintSec,
  videoClassName,
}: {
  src: string;
  isMine: boolean;
  onLoaded: () => void;
  onError: () => void;
  durationHintSec?: number;
  videoClassName: string;
}) {
  const [metaDuration, setMetaDuration] = useState<number | null>(null);

  useEffect(() => {
    setMetaDuration(null);
  }, [src]);

  const onMeta = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0 && d !== Number.POSITIVE_INFINITY) setMetaDuration(d);
  }, []);

  const durSec =
    metaDuration != null && metaDuration > 0
      ? metaDuration
      : durationHintSec != null && durationHintSec > 0 && Number.isFinite(durationHintSec)
        ? durationHintSec
        : null;
  const durationLabel = durSec != null ? formatMessengerVideoDuration(durSec) : null;

  return (
    <>
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        controls={false}
        disablePictureInPicture
        className={videoClassName}
        onLoadedData={onLoaded}
        onLoadedMetadata={onMeta}
        onError={onError}
      />
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/55"
        aria-hidden
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <span
          className={[
            'flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-md ring-[0.5px] ring-white/35',
            isMine ? 'bg-white/20 text-white backdrop-blur-[1px]' : 'bg-black/40 text-white backdrop-blur-[1px]',
          ].join(' ')}
        >
          <LuPlay className="ml-0.5 h-7 w-7" strokeWidth={2.2} aria-hidden />
        </span>
      </span>
      {durationLabel ? (
        <span
          className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
          aria-label={`Длительность ${durationLabel}`}
        >
          {durationLabel}
        </span>
      ) : (
        <span
          className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/95"
          aria-hidden
        >
          Видео
        </span>
      )}
    </>
  );
}
