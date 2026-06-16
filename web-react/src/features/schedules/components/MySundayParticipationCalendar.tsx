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
      <div className="flex flex-col gap-2 border-b border-stone-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="order-1 text-center text-sm font-extrabold capitalize text-stone-900 sm:order-none sm:flex-1 sm:text-base">
          {format(month, 'LLLL yyyy', { locale: ru })}
        </p>
        <div className="order-2 flex items-center justify-center gap-1.5 sm:order-none sm:shrink-0">
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 text-stone-700 active:bg-stone-50"
            aria-label="Предыдущий месяц"
          >
            <LuChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(startOfMonth(new Date()))}
            className="tap-highlight-transparent min-h-[44px] flex-1 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 px-3 text-sm font-extrabold text-primary active:brightness-[0.98] sm:flex-initial"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 text-stone-700 active:bg-stone-50"
            aria-label="Следующий месяц"
          >
            <LuChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/90">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={[
              'py-1.5 text-center text-[9px] font-extrabold uppercase tracking-wide sm:py-2 sm:text-[10px]',
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
                'tap-highlight-transparent touch-manipulation flex min-h-[52px] flex-col items-center justify-center gap-0.5 bg-white p-0.5 active:bg-stone-50 sm:min-h-[56px] sm:gap-1 sm:p-1',
                !inMonth ? 'opacity-30' : '',
                myRole === 'Ведущий' ? 'bg-sky-50/80' : '',
                myRole === 'Проповедник' ? 'bg-violet-50/80' : '',
                selected ? 'ring-2 ring-inset ring-primary z-[1]' : '',
                !clickable ? 'cursor-default' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold sm:h-8 sm:w-8 sm:text-xs',
                  today ? 'bg-primary text-white' : sunday ? 'text-primary' : 'text-stone-800',
                ].join(' ')}
              >
                {format(day, 'd')}
              </span>
              {myRole ? (
                <>
                  <span
                    className={[
                      'hidden max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-extrabold leading-none sm:inline',
                      myRole === 'Ведущий' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800',
                    ].join(' ')}
                  >
                    {myRole === 'Ведущий' ? 'Вед.' : 'Проп.'}
                  </span>
                  <span
                    className={[
                      'h-2 w-2 rounded-full sm:hidden',
                      myRole === 'Ведущий' ? 'bg-sky-500' : 'bg-violet-500',
                    ].join(' ')}
                    aria-label={myRole}
                  />
                </>
              ) : sunday && plan ? (
                <span className="h-1.5 w-1.5 rounded-full bg-stone-300" aria-hidden />
              ) : (
                <span className="h-2 sm:h-3" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-stone-100 px-3 py-2.5 text-[11px] font-semibold text-stone-500 sm:justify-start">
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
