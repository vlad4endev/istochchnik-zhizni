import { Fragment } from 'react';
import { LuChevronLeft, LuChevronRight, LuLoaderCircle } from 'react-icons/lu';

import type { SundayScheduleTableModel } from '../utils/sundayScheduleTableModel';

type Props = {
  model: SundayScheduleTableModel | null;
  loading?: boolean;
  onPrevPeriod?: () => void;
  onNextPeriod?: () => void;
  onTodayPeriod?: () => void;
};

const thClass =
  'border border-stone-900 bg-[#d9d9d9] px-2 py-1.5 text-center text-sm font-normal text-stone-900';
const tdClass = 'border border-stone-900 px-2 py-1 text-sm text-stone-900';
const roleRowClass =
  'border border-stone-900 bg-[#8faadc] px-2 py-1 text-sm font-normal text-stone-900';

export function SundayScheduleTableView({
  model,
  loading = false,
  onPrevPeriod,
  onNextPeriod,
  onTodayPeriod,
}: Props) {
  if (loading) {
    return (
      <div className="flex justify-center rounded-lg border border-stone-300 bg-white py-16">
        <LuLoaderCircle className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!model) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-center font-serif text-base font-normal text-stone-900 sm:text-left sm:text-lg">
          {model.title}
        </h2>
        {onPrevPeriod && onNextPeriod ? (
          <div className="flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={onPrevPeriod}
              className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 active:bg-stone-50"
              aria-label="Предыдущий период"
            >
              <LuChevronLeft className="h-5 w-5" />
            </button>
            {onTodayPeriod ? (
              <button
                type="button"
                onClick={onTodayPeriod}
                className="tap-highlight-transparent min-h-[40px] rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-800 active:bg-stone-50"
              >
                Сегодня
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNextPeriod}
              className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 active:bg-stone-50"
              aria-label="Следующий период"
            >
              <LuChevronRight className="h-5 w-5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[640px] border-collapse border border-stone-900 font-serif text-sm">
          <thead>
            <tr>
              <th className={`${thClass} w-10`}>№</th>
              <th className={`${thClass} min-w-[180px] text-left`}>Ф.И.О.</th>
              {model.months.map((month) => (
                <th key={month.key} className={`${thClass} min-w-[88px]`}>
                  {month.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.sections.map((section) => (
              <Fragment key={section.roleTitle}>
                <tr>
                  <td className={roleRowClass} />
                  <td className={`${roleRowClass} text-left font-normal`}>{section.roleTitle}</td>
                  {section.monthHeaders.map((header, index) => (
                    <td key={`${section.roleTitle}-h-${index}`} className={`${roleRowClass} text-center`}>
                      {header}
                    </td>
                  ))}
                </tr>
                {section.rows.map((row, index) => (
                  <tr key={`${section.roleTitle}-${row.memberId}`}>
                    <td className={`${tdClass} text-center`}>{index + 1}</td>
                    <td className={`${tdClass} text-left`}>{row.name}</td>
                    {row.monthCells.map((cell, cellIndex) => (
                      <td
                        key={`${row.memberId}-${cellIndex}`}
                        className={`${tdClass} text-center align-middle`}
                      >
                        {cell || '\u00A0'}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
