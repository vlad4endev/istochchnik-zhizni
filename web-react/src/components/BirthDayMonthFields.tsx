import { useEffect, useRef, useState } from 'react';
import {
  BIRTH_MONTH_OPTIONS,
  birthDayMonthToApiYmd,
  daysInBirthMonth,
  parseBirthDayMonthFromApi,
} from '../lib/birthDate';

type BirthDayMonthFieldsProps = {
  value: string;
  onChange: (apiYmd: string) => void;
  dayId?: string;
  monthId?: string;
  label?: string;
  labelClassName?: string;
  selectClassName?: string;
  required?: boolean;
};

export function BirthDayMonthFields({
  value,
  onChange,
  dayId,
  monthId,
  label = 'День и месяц рождения',
  labelClassName = 'mb-1 block text-xs font-semibold text-stone-600',
  selectClassName,
  required = false,
}: BirthDayMonthFieldsProps) {
  const parsed = parseBirthDayMonthFromApi(value);
  const [day, setDay] = useState(parsed.day);
  const [month, setMonth] = useState(parsed.month);
  /** Tracks values we emitted so empty onChange during partial edit does not wipe local picks. */
  const lastEmittedRef = useRef(value);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const next = parseBirthDayMonthFromApi(value);
    setDay(next.day);
    setMonth(next.month);
  }, [value]);

  function update(nextDay: string, nextMonth: string) {
    let dayValue = nextDay;
    const monthNum = nextMonth ? Number(nextMonth) : NaN;
    const dayNum = nextDay ? Number(nextDay) : NaN;

    if (
      nextMonth &&
      Number.isInteger(monthNum) &&
      Number.isInteger(dayNum) &&
      dayNum > 0
    ) {
      const capped = daysInBirthMonth(monthNum);
      if (dayNum > capped) {
        dayValue = String(capped);
      }
    }

    setDay(dayValue);
    setMonth(nextMonth);

    if (!dayValue || !nextMonth) {
      lastEmittedRef.current = '';
      onChange('');
      return;
    }

    const ymd = birthDayMonthToApiYmd(Number(dayValue), Number(nextMonth)) ?? '';
    lastEmittedRef.current = ymd;
    onChange(ymd);
  }

  function onDayChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (!digits) {
      update('', month);
      return;
    }
    const n = Number(digits);
    if (!Number.isInteger(n) || n < 1) {
      update('', month);
      return;
    }
    update(String(n), month);
  }

  const fieldClass = selectClassName ?? '';

  return (
    <div>
      {label ? (
        <span className={labelClassName}>
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </span>
      ) : null}
      {/* Stack on very narrow phones, side-by-side from ~360px */}
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-[minmax(5.5rem,7rem)_minmax(0,1fr)]">
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-stone-400 min-[360px]:sr-only">
            День
          </span>
          <input
            id={dayId}
            className={`${fieldClass} text-center tabular-nums min-[360px]:text-left`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="bday-day"
            placeholder="День"
            value={day}
            required={required}
            aria-label="День рождения"
            maxLength={2}
            enterKeyHint="next"
            onChange={(e) => onDayChange(e.target.value)}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-stone-400 min-[360px]:sr-only">
            Месяц
          </span>
          <select
            id={monthId}
            className={`${fieldClass} appearance-none bg-[length:1rem] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378716c'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
            }}
            value={month}
            required={required}
            autoComplete="bday-month"
            aria-label="Месяц рождения"
            onChange={(e) => update(day, e.target.value)}
          >
            <option value="">Месяц</option>
            {BIRTH_MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
