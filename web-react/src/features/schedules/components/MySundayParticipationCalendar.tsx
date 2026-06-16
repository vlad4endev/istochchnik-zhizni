import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSunday,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import type { SundaySchedulePlan } from '../api/sundayScheduleApi';
import { mySundayRole } from '../utils/sundayScheduleDisplay';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Props = {
  month: Date;
  onMonthChange: (month: Date) => void;
  plansByDate: Map<string, SundaySchedulePlan>;
  memberId: number | null | undefined;
  onSelectPlan?: (plan: SundaySchedulePlan) => void;
  selectedDate?: string | null;
};

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function MySundayParticipationCalendar({
  month,
  onMonthChange,
  plansByDate,
  memberId,
  onSelectPlan,
  selectedDate,
}: Props) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-3">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-700 active:bg-stone-50"
          aria-label="Предыдущий месяц"
        >
          <LuChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-extrabold capitalize text-stone-900 sm:text-base">
          {format(month, 'LLLL yyyy', { locale: ru })}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-700 active:bg-stone-50"
          aria-label="Следующий месяц"
        >
          <LuChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/90">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={[
              'py-2 text-center text-[10px] font-extrabold uppercase tracking-wide',
              i === 6 ? 'text-primary' : 'text-stone-400',
            ].join(' ')}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-stone-100">
        {days.map((day) => {
          const key = ymd(day);
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const sunday = isSunday(day);
          const plan = plansByDate.get(key) ?? null;
          const myRole = plan ? mySundayRole(plan, memberId) : null;
          const selected = selectedDate === key;
          const clickable = Boolean(plan && myRole && onSelectPlan);

          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => plan && myRole && onSelectPlan?.(plan)}
              className={[
                'tap-highlight-transparent flex min-h-[56px] flex-col items-center justify-center gap-1 bg-white p-1 active:bg-stone-50',
                !inMonth ? 'opacity-30' : '',
                myRole === 'Ведущий' ? 'bg-sky-50/80' : '',
                myRole === 'Проповедник' ? 'bg-violet-50/80' : '',
                selected ? 'ring-2 ring-inset ring-primary' : '',
                !clickable ? 'cursor-default' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold',
                  today ? 'bg-primary text-white' : sunday ? 'text-primary' : 'text-stone-800',
                ].join(' ')}
              >
                {format(day, 'd')}
              </span>
              {myRole ? (
                <span
                  className={[
                    'max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-extrabold leading-none',
                    myRole === 'Ведущий' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800',
                  ].join(' ')}
                >
                  {myRole === 'Ведущий' ? 'Вед.' : 'Проп.'}
                </span>
              ) : sunday && plan ? (
                <span className="h-1.5 w-1.5 rounded-full bg-stone-300" aria-hidden />
              ) : (
                <span className="h-3" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-stone-100 px-3 py-2.5 text-[11px] font-semibold text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
          Ведущий
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
          Проповедник
        </span>
      </div>
    </section>
  );
}
