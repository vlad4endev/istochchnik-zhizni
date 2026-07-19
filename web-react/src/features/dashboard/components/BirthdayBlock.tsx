import { useMemo } from 'react';
import { format, parse, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { FaCakeCandles } from 'react-icons/fa6';
import { LuMessageCircle } from 'react-icons/lu';
import type { BirthdayWeekItem } from '../../calendar/api';

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
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        <FaCakeCandles
          size={13}
          className="shrink-0 text-[var(--primary)]"
          aria-hidden
        />
        Дни рождения
      </div>

      {/* translateZ(0) изолирует overflow:hidden+border-radius от scroll-repaint на Android */}
      <div
        className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface-elevated)]"
        style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
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
    today: {
      label: '🎉 Сегодня',
      className: 'bg-[var(--primary)] text-[var(--text-on-primary)]',
    },
    tomorrow: {
      label: 'Завтра',
      className:
        'bg-[color-mix(in_srgb,var(--primary)_16%,var(--surface))] text-[var(--primary)]',
    },
    soon: { label: null, className: '' },
  } as const;

  const pill = pillConfig[person.status];

  return (
    <div
      className={[
        'flex items-center gap-3 px-3.5 py-3.5 [-webkit-tap-highlight-color:transparent]',
        isLast ? '' : 'border-b border-[var(--border)]',
      ].join(' ')}
    >
      <div className="relative shrink-0">
        <div
          className="flex h-[46px] w-[46px] select-none items-center justify-center rounded-full text-[15px] font-bold"
          style={{ background: palette.bg, color: palette.text }}
          aria-hidden
        >
          {initials}
        </div>
        {person.status === 'today' ? <div className="bday-ring" aria-hidden /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--text)] [unicode-bidi:plaintext] [direction:ltr]">
            {person.name}
          </span>
          {pill.label != null ? (
            <span
              className={[
                'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold',
                pill.className,
              ].join(' ')}
            >
              {pill.label}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-[var(--text-muted)] [unicode-bidi:plaintext] [direction:ltr]">
          {formatBirthdayDate(person.week_date)}
        </div>
      </div>

      <button
        type="button"
        onClick={onMessage}
        aria-label={`Написать поздравление ${person.name}`}
        className="tap-highlight-transparent touch-manipulation flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 transition-transform active:scale-95"
        style={{ background: palette.bg, color: palette.text }}
      >
        <LuMessageCircle size={17} aria-hidden />
      </button>
    </div>
  );
}
