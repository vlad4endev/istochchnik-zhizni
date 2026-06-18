import type { CSSProperties } from 'react';
import type { BroadcastData } from '../../../api/broadcast';

interface PastStreamsProps {
  items: BroadcastData[];
  onOpen: (item: BroadcastData) => void;
}

export function PastStreams({ items, onOpen }: PastStreamsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div style={ps.card}>
      <div style={ps.label}>Прошлые трансляции</div>
      {items.map((item, i) => {
        const dateStr = item.starts_at
          ? new Date(item.starts_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'Дата не задана';

        return (
          <div key={item.id}>
            {i > 0 && <div style={ps.divider} />}
            <div
              role="button"
              tabIndex={0}
              style={ps.row}
              onClick={() => onOpen(item)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}
            >
              <div style={ps.thumb}>▶</div>
              <div style={ps.info}>
                <div style={ps.title}>{item.title ?? 'Без названия'}</div>
                <div style={ps.date}>{dateStr}</div>
              </div>
              <span style={ps.arrow}>›</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ps: Record<string, CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 20,
    border: '1px solid rgba(0,0,0,0.07)',
    padding: '13px 14px',
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: '#AAA',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 10,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    padding: '4px 0',
    WebkitTapHighlightColor: 'transparent',
  },
  thumb: {
    width: 58,
    height: 36,
    borderRadius: 8,
    background: '#1a0808',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 12,
    fontWeight: 600,
    color: '#111',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  date: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  divider: {
    height: 0.5,
    background: 'rgba(0,0,0,0.06)',
    margin: '6px 0',
  },
  arrow: {
    fontSize: 18,
    color: '#CCC',
    flexShrink: 0,
  },
};
