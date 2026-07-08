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
  const { day, month } = parseBirthDayMonthFromApi(value);
  const maxDay = month ? daysInBirthMonth(Number(month)) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => String(i + 1));

  function update(nextDay: string, nextMonth: string) {
    if (!nextDay || !nextMonth) {
      onChange('');
      return;
    }
    const monthNum = Number(nextMonth);
    let dayNum = Number(nextDay);
    const maxDay = daysInBirthMonth(monthNum);
    if (dayNum > maxDay) dayNum = maxDay;
    const ymd = birthDayMonthToApiYmd(dayNum, monthNum);
    onChange(ymd ?? '');
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
        <select
          id={dayId}
          className={selectClassName}
          value={day}
          required={required}
          onChange={(e) => update(e.target.value, month)}
        >
          <option value="">День</option>
          {dayOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          id={monthId}
          className={selectClassName}
          value={month}
          required={required}
          onChange={(e) => update(day, e.target.value)}
        >
          <option value="">Месяц</option>
          {BIRTH_MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
