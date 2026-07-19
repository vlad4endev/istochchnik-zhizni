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

  return (
    <div>
      {label ? (
        <span className={labelClassName}>
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </span>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="sr-only">День рождения</span>
          <input
            id={dayId}
            className={selectClassName}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="bday-day"
            placeholder="День"
            value={day}
            required={required}
            aria-label="День рождения"
            maxLength={2}
            onChange={(e) => onDayChange(e.target.value)}
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Месяц рождения</span>
          <select
            id={monthId}
            className={selectClassName}
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
