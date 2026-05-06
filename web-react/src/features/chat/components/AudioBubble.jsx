import { useCallback, useMemo, useRef, useState } from 'react';

import { LuPause, LuPlay } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

/**
 * @param {{
 *   messageId: string,
 *   isSender: boolean,
 *   mediaUrl?: string | null,
 *   durationSec?: number | null,
 * }} props
 */
export function AudioBubble({ messageId, isSender, mediaUrl, durationSec }) {
  const audioRef = useRef(/** @type {HTMLAudioElement | null} */ (null));
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);

  const resolvedUrl = mediaUrl ? resolvePublicUrl(mediaUrl) : null;
  const totalSec = typeof durationSec === 'number' && durationSec > 0 ? durationSec : 0;

  const bars = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < messageId.length; i += 1) {
      seed = (seed + messageId.charCodeAt(i) * (i + 1)) % 2147483647;
    }
    const out = [];
    for (let i = 0; i < 20; i += 1) {
      seed = (seed * 16807) % 2147483647;
      const h = 4 + (seed % 17);
      out.push(h);
    }
    return out;
  }, [messageId]);

  const bubble =
    isSender
      ? 'bg-[#00BF6D] text-white rounded-[20px] rounded-br-sm'
      : 'bg-gray-100 text-gray-900 rounded-[20px] rounded-bl-sm dark:bg-gray-700 dark:text-gray-100';

  const formatTime = (s) => {
    const n = Math.max(0, Math.floor(s));
    const m = Math.floor(n / 60);
    const sec = n % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!resolvedUrl) return;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [playing, resolvedUrl]);

  const displayTotal = totalSec > 0 ? totalSec : currentSec;

  return (
    <div
      className={`flex min-w-[160px] items-center gap-2 px-3 py-2 ${bubble}`}
    >
      {resolvedUrl ? (
        <audio
          ref={audioRef}
          src={resolvedUrl}
          preload="metadata"
          className="hidden"
          onTimeUpdate={(e) => setCurrentSec(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
        />
      ) : null}
      <button
        type="button"
        onClick={toggle}
        disabled={!resolvedUrl}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/10 disabled:opacity-40 ${
          isSender ? '' : 'border-gray-300 dark:border-gray-600'
        }`}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? <LuPause size={18} /> : <LuPlay size={18} className="pl-0.5" />}
      </button>
      <div className="flex min-w-0 flex-1 items-end gap-px">
        {bars.map((h, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={`w-0.5 rounded-full ${isSender ? 'bg-white/70' : 'bg-gray-400 dark:bg-gray-500'}`}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums">
        {formatTime(playing ? currentSec : displayTotal)}
      </span>
    </div>
  );
}
