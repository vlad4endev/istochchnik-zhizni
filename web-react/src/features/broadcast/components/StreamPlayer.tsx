import type { CSSProperties } from 'react';
import { toEmbedUrlForPlayer, detectPlatformLabel } from '../../../utils/broadcast';

interface StreamPlayerProps {
  url: string | null | undefined;
  title?: string | null;
  date?: string | null;
  viewersCount?: number | null;
  isLive?: boolean;
  /** Text shown in the time-row below the player (e.g. countdown or "В эфире X мин") */
  timeLine?: string | null;
  /** Secondary text shown below the player (e.g. estimated end time) */
  timeLineSub?: string | null;
}

export function StreamPlayer({ url, title, date, viewersCount, isLive, timeLine, timeLineSub }: StreamPlayerProps) {
  const embedUrl = toEmbedUrlForPlayer(url);
  const platform = detectPlatformLabel(url);

  const handleShare = () => {
    if (navigator.share && url) {
      navigator.share({ url, title: title ?? undefined }).catch(() => undefined);
    }
  };

  if (!embedUrl) return null;

  return (
    <div style={s.card}>
      {/* Brand strip shown only when live */}
      {isLive && (
        <div style={s.liveStrip}>
          <div style={s.liveBadge}>
            <div className="live-dot-pulse" style={s.liveDot} />
            В ЭФИРЕ
          </div>
          {viewersCount != null && viewersCount > 0 && (
            <div style={s.viewers}>
              <div style={s.vDot} />
              {viewersCount} {viewersCount === 1 ? 'смотрит' : 'смотрят'}
            </div>
          )}
        </div>
      )}

      {/* Player wrapper — overflow:hidden clips RuTube attribution bar */}
      <div style={s.playerWrap}>
        <iframe
          src={embedUrl}
          style={s.iframe}
          allow="autoplay"
          title={title ?? 'Трансляция'}
        />

        {/* Top overlay: platform badge + share button */}
        <div style={s.overlayTop}>
          <div style={s.platformBadge}>{platform}</div>
          {navigator.share != null && (
            <button
              type="button"
              style={s.iconBtn}
              onClick={handleShare}
              aria-label="Поделиться"
            >
              ↗
            </button>
          )}
        </div>

        {/* Bottom overlay: title gradient */}
        {title && (
          <div style={s.overlayBottom}>
            <div style={s.overlayTitle}>
              {title}{date ? ` · ${date}` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Meta row below player */}
      <div style={s.meta}>
        {title && <div style={s.streamName}>{title}</div>}
        <div style={s.timeRow}>
          <span style={s.timeText}>
            {timeLine ?? (isLive ? 'Идёт прямо сейчас' : 'До начала: время уточняется')}
          </span>
        </div>
        {timeLineSub && (
          <div style={s.timeLineSub}>{timeLineSub}</div>
        )}
      </div>
    </div>
  );
}

const BRAND = '#7B1C1C';

const s: Record<string, CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 20,
    border: '1px solid rgba(0,0,0,0.07)',
    overflow: 'hidden',
    width: '100%',
  },
  liveStrip: {
    background: BRAND,
    padding: '9px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#FF4444',
    // Animation class `live-dot-pulse` defined in index.css
  },
  viewers: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  vDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#44DD88',
  },

  // overflow:hidden + border-radius clip the RuTube attribution that renders outside the video frame
  playerWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    overflow: 'hidden',
    backgroundColor: '#1a0808',
  },
  iframe: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Slightly oversized so negative margins clip edge branding
    width: 'calc(100% + 4px)',
    height: 'calc(100% + 4px)',
    margin: '-2px -2px',
    border: 'none',
  },

  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
    pointerEvents: 'none',
  },
  platformBadge: {
    background: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    pointerEvents: 'none',
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)',
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 12px 10px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
    zIndex: 10,
    pointerEvents: 'none',
  },
  overlayTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    lineHeight: 1.3,
  },

  meta: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  streamName: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111',
  },
  timeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    background: '#F4F0EE',
    borderRadius: 10,
    padding: '8px 11px',
  },
  timeText: {
    fontSize: 12,
    fontWeight: 600,
    color: '#854F0B',
  },
  timeLineSub: {
    fontSize: 11,
    color: '#999',
    fontWeight: 500,
  },
};
