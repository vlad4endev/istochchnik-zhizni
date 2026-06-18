import { useMemo } from 'react';
import { format, parse, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { FaCakeCandles } from 'react-icons/fa6';
import { LuMessageCircle } from 'react-icons/lu';
import type { BirthdayWeekItem } from '../../calendar/api';

const BRAND = '#7D3640';
const BRAND_LIGHT = '#FDE8E8';

type BirthdayStatus = 'today' | 'tomorrow' | 'soon';
type BirthdayWithStatus = BirthdayWeekItem & { status: BirthdayStatus };

const AVATAR_PALETTES = [
  { bg: '#FDE8E8', text: '#7D3640' },
  { bg: '#EEEDFE', text: '#4A3AAA' },
  { bg: '#E1F5EE', text: '#0B6E56' },
  { bg: '#FAEEDA', text: '#854F0B' },
  { bg: '#F4C0D1', text: '#72243E' },
] as const;

type AvatarPalette = (typeof AVATAR_PALETTES)[number];

function getAvatarPalette(name: string): AvatarPalette {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]!;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function formatBirthdayDate(weekDateYMD: string): string {
  const d = parse(weekDateYMD, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'EEE, d MMMM', { locale: ru });
}


function getStatus(weekDateYMD: string, today: Date): BirthdayStatus | null {
  const d = parse(weekDateYMD, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) return null;
  const diff = Math.round(
    (startOfDay(d).getTime() - startOfDay(today).getTime()) / 86400000,
  );
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff >= 2 && diff <= 6) return 'soon';
  return null;
}

const STATUS_ORDER: Record<BirthdayStatus, number> = { today: 0, tomorrow: 1, soon: 2 };

// ─── Main component ──────────────────────────────────────────────────────────

export function BirthdayBlock({
  birthdays,
  onMessage,
}: {
  birthdays: BirthdayWeekItem[];
  onMessage: (person: BirthdayWeekItem) => void;
}) {
  const thisWeek = useMemo<BirthdayWithStatus[]>(() => {
    const today = new Date();
    return birthdays
      .flatMap<BirthdayWithStatus>((b) => {
        const status = getStatus(b.week_date, today);
        return status !== null ? [{ ...b, status }] : [];
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [birthdays]);

  if (thisWeek.length === 0) return null;

  return (
    <section>
      {/* Section header */}
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#888]">
        <FaCakeCandles
          size={13}
          style={{ color: BRAND, flexShrink: 0 }}
          aria-hidden
        />
        Дни рождения
      </div>

      {/* Card — translateZ(0) изолирует overflow:hidden+border-radius от scroll-repaint на Android */}
      <div
        className="overflow-hidden rounded-[20px] bg-white"
        style={{ border: '1px solid rgba(0,0,0,0.07)', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
      >
        {thisWeek.map((person, i) => (
          <BirthdayRow
            key={person.id}
            person={person}
            isLast={i === thisWeek.length - 1}
            onMessage={() => onMessage(person)}
          />
        ))}
      </div>

    </section>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

function BirthdayRow({
  person,
  isLast,
  onMessage,
}: {
  person: BirthdayWithStatus;
  isLast: boolean;
  onMessage: () => void;
}) {
  const palette = getAvatarPalette(person.name);
  const initials = getInitials(person.name);

  const pillConfig = {
    today:    { label: '🎉 Сегодня', bg: BRAND,       color: '#fff'  },
    tomorrow: { label: 'Завтра',      bg: BRAND_LIGHT, color: BRAND   },
    soon:     { label: null,          bg: '',          color: ''      },
  } as const;

  const pill = pillConfig[person.status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 14px',
        borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.06)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: palette.bg,
            color: palette.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 700,
            userSelect: 'none',
          }}
          aria-hidden
        >
          {initials}
        </div>
        {person.status === 'today' && (
          <div className="bday-ring" aria-hidden />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            marginBottom: 3,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#111',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              unicodeBidi: 'plaintext',
              direction: 'ltr',
            }}
          >
            {person.name}
          </span>
          {pill.label != null && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                background: pill.bg,
                color: pill.color,
              }}
            >
              {pill.label}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#999',
            unicodeBidi: 'plaintext',
            direction: 'ltr',
          }}
        >
          {formatBirthdayDate(person.week_date)}
        </div>
      </div>

      {/* Message button */}
      <button
        type="button"
        onClick={onMessage}
        aria-label={`Написать поздравление ${person.name}`}
        className="tap-highlight-transparent touch-manipulation"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          background: palette.bg,
          color: palette.text,
          transition: 'transform 0.1s',
          WebkitTapHighlightColor: 'transparent',
          opacity: 1,
        }}
      >
        <LuMessageCircle size={17} aria-hidden />
      </button>
    </div>
  );
}
