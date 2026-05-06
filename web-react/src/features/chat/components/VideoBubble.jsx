import { useRef, useState } from 'react';

import { LuPlay } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

/**
 * @param {{
 *   mediaUrl?: string | null,
 *   isSender: boolean,
 * }} props
 */
export function VideoBubble({ mediaUrl, isSender }) {
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null));
  const [playing, setPlaying] = useState(false);
  const resolved = mediaUrl ? resolvePublicUrl(mediaUrl) : null;

  const ring = isSender ? 'ring-2 ring-[#00BF6D]/40' : 'ring-2 ring-gray-200 dark:ring-gray-600';

  if (!resolved) {
    return (
      <div
        className={`relative overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700 ${ring}`}
        style={{ aspectRatio: '1.6' }}
      >
        <div className="flex h-full items-center justify-center text-xs text-gray-500">Нет превью</div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${ring}`}
      style={{ aspectRatio: '1.6' }}
    >
      <video
        ref={videoRef}
        src={resolved}
        className="h-full w-full object-cover"
        muted={!playing}
        playsInline
        preload="metadata"
        controls={playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {!playing ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/35"
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            el.muted = false;
            void el.play().catch(() => {});
          }}
          aria-label="Воспроизвести видео"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
            <LuPlay size={28} className="pl-1" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
