import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { BroadcastData } from '../../../api/broadcast';
import { detectPlatformLabel } from '../../../utils/broadcast';

interface BroadcastHistoryProps {
  items: BroadcastData[];
  activeId?: number | null;
  isLoading?: boolean;
  onOpen: (item: BroadcastData) => void;
}

const INITIAL_VISIBLE = 6;

function formatHistoryDate(startsAt: string | null): string {
  if (!startsAt) return 'Дата не указана';
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return 'Дата не указана';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatHistoryTime(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function BroadcastHistory({ items, activeId, isLoading, onOpen }: BroadcastHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <section style={styles.card} aria-busy="true" aria-label="История трансляции">
        <header style={styles.header}>
          <div>
            <div style={styles.label}>История трансляции</div>
            <div style={styles.subtitle}>Загрузка записей…</div>
          </div>
        </header>
        <div style={styles.list}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={styles.skeletonRow}>
              <div style={styles.skeletonThumb} />
              <div style={styles.skeletonInfo}>
                <div style={{ ...styles.skeletonLine, width: '62%' }} />
                <div style={{ ...styles.skeletonLine, width: '38%', marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const list = items ?? [];
  const visible = expanded ? list : list.slice(0, INITIAL_VISIBLE);
  const hasMore = list.length > INITIAL_VISIBLE;

  return (
    <section style={styles.card} aria-label="История трансляции">
      <header style={styles.header}>
        <div>
          <div style={styles.label}>История трансляции</div>
          <div style={styles.subtitle}>
            {list.length === 0
              ? 'Просматривайте записи прошедших эфиров'
              : `${list.length} ${pluralRecords(list.length)}`}
          </div>
        </div>
      </header>

      {list.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon} aria-hidden>
            ▶
          </div>
          <div style={styles.emptyTitle}>Записей пока нет</div>
          <div style={styles.emptyText}>
            Когда эфир завершится, запись появится здесь — её можно будет открыть в плеере выше.
          </div>
        </div>
      ) : (
        <>
          <div style={styles.list}>
            {visible.map((item) => {
              const isActive = activeId != null && item.id === activeId;
              const platform = detectPlatformLabel(item.stream_url) || platformLabel(item.platform);
              const time = formatHistoryTime(item.starts_at);
              const dateStr = formatHistoryDate(item.starts_at);

              const open = () => onOpen(item);
              const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open();
                }
              };

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  style={{
                    ...styles.row,
                    ...(isActive ? styles.rowActive : null),
                  }}
                  onClick={open}
                  onKeyDown={onKeyDown}
                  aria-pressed={isActive}
                  aria-label={`Смотреть запись: ${item.title ?? 'Без названия'}`}
                >
                  <div style={{ ...styles.thumb, ...(isActive ? styles.thumbActive : null) }}>
                    <span style={styles.playGlyph} aria-hidden>
                      {isActive ? '●' : '▶'}
                    </span>
                  </div>
                  <div style={styles.info}>
                    <div style={styles.title}>{item.title?.trim() || 'Без названия'}</div>
                    <div style={styles.meta}>
                      <span>{dateStr}</span>
                      {time ? (
                        <>
                          <span style={styles.dot} aria-hidden>
                            ·
                          </span>
                          <span>{time}</span>
                        </>
                      ) : null}
                      <span style={styles.dot} aria-hidden>
                        ·
                      </span>
                      <span style={styles.platformChip}>{platform}</span>
                    </div>
                    {item.description?.trim() ? (
                      <div style={styles.description}>{item.description.trim()}</div>
                    ) : null}
                  </div>
                  <span style={{ ...styles.arrow, ...(isActive ? styles.arrowActive : null) }} aria-hidden>
                    {isActive ? '●' : '›'}
                  </span>
                </div>
              );
            })}
          </div>

          {hasMore ? (
            <button
              type="button"
              style={styles.moreBtn}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Свернуть' : `Показать ещё ${list.length - INITIAL_VISIBLE}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function pluralRecords(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'запись';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'записи';
  return 'записей';
}

function platformLabel(platform: BroadcastData['platform']): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'rutube') return 'RuTube';
  if (platform === 'vk') return 'VK Видео';
  return 'Видео';
}

const BRAND = '#7B1C1C';

const styles: Record<string, CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 20,
    border: '1px solid rgba(0,0,0,0.07)',
    padding: '16px 14px 14px',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: 800,
    color: BRAND,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: 600,
    color: '#666',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
    padding: '10px 10px',
    borderRadius: 14,
    background: '#F8F5F4',
    border: '1px solid transparent',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  },
  rowActive: {
    background: 'rgba(123, 28, 28, 0.08)',
    border: '1px solid rgba(123, 28, 28, 0.22)',
  },
  thumb: {
    width: 64,
    height: 40,
    borderRadius: 10,
    background: 'linear-gradient(145deg, #2a1010 0%, #1a0808 55%, #3a1810 100%)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
  },
  thumbActive: {
    background: `linear-gradient(145deg, ${BRAND} 0%, #5a1414 100%)`,
  },
  playGlyph: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 1,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#181818',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    fontSize: 11,
    fontWeight: 600,
    color: '#888',
  },
  dot: {
    color: '#CCC',
  },
  platformChip: {
    color: BRAND,
  },
  description: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 500,
    color: '#999',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  arrow: {
    fontSize: 20,
    color: '#CCC',
    flexShrink: 0,
    lineHeight: 1,
  },
  arrowActive: {
    color: BRAND,
    fontSize: 10,
  },
  moreBtn: {
    marginTop: 12,
    width: '100%',
    border: 'none',
    background: '#F4F0EE',
    borderRadius: 12,
    padding: '11px 14px',
    fontSize: 13,
    fontWeight: 700,
    color: BRAND,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '22px 12px 18px',
    borderRadius: 14,
    background: '#F8F5F4',
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: 'linear-gradient(145deg, #2a1010 0%, #1a0808 100%)',
    color: 'rgba(255,255,255,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#222',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: 500,
    color: '#888',
    lineHeight: 1.45,
    maxWidth: 280,
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 10px',
    borderRadius: 14,
    background: '#F8F5F4',
  },
  skeletonThumb: {
    width: 64,
    height: 40,
    borderRadius: 10,
    background: '#E8E2E0',
    flexShrink: 0,
  },
  skeletonInfo: {
    flex: 1,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    background: '#E8E2E0',
  },
};
