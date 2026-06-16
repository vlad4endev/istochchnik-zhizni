import { Fragment } from 'react';
import { LuChevronLeft, LuChevronRight, LuLoaderCircle, LuMic, LuUser } from 'react-icons/lu';

import type {
  SundayScheduleTableModel,
  SundayScheduleTableMonth,
  SundayScheduleTableSection,
} from '../utils/sundayScheduleTableModel';

type Props = {
  model: SundayScheduleTableModel | null;
  loading?: boolean;
  onPrevPeriod?: () => void;
  onNextPeriod?: () => void;
  onTodayPeriod?: () => void;
};

function DayChips({ value, compact = false }: { value: string; compact?: boolean }) {
  const days = value
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  if (days.length === 0) {
    return <span className="text-xs font-semibold text-stone-300">—</span>;
  }
  return (
    <div className={['flex flex-wrap gap-1', compact ? 'justify-start' : 'justify-center'].join(' ')}>
      {days.map((day) => (
        <span
          key={day}
          className={[
            'inline-flex items-center justify-center rounded-lg font-extrabold text-primary',
            compact
              ? 'min-h-[26px] min-w-[26px] bg-primary/10 px-1.5 py-0.5 text-[11px]'
              : 'min-h-[28px] min-w-[28px] bg-primary/10 px-2 py-0.5 text-xs shadow-sm ring-1 ring-primary/10',
          ].join(' ')}
        >
          {day}
        </span>
      ))}
    </div>
  );
}

function SundayDaysHint({ days }: { days: string }) {
  if (!days.trim()) return null;
  return (
    <p className="mt-1 text-[10px] font-semibold leading-snug text-stone-500 sm:text-[11px]">
      {days.split(',').map((d) => d.trim()).filter(Boolean).join(' · ')}
    </p>
  );
}

function PeriodNav({
  onPrev,
  onNext,
  onToday,
}: {
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 sm:shrink-0">
      <button
        type="button"
        onClick={onPrev}
        className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100"
        aria-label="Предыдущий период"
      >
        <LuChevronLeft className="h-5 w-5" />
      </button>
      {onToday ? (
        <button
          type="button"
          onClick={onToday}
          className="tap-highlight-transparent min-h-[44px] flex-1 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 px-4 text-sm font-extrabold text-primary hover:brightness-[1.02] active:brightness-[0.98] sm:flex-initial sm:px-3"
        >
          Сегодня
        </button>
      ) : null}
      <button
        type="button"
        onClick={onNext}
        className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100"
        aria-label="Следующий период"
      >
        <LuChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function SectionIcon({ roleTitle }: { roleTitle: SundayScheduleTableSection['roleTitle'] }) {
  const isLeader = roleTitle.startsWith('Ведущий');
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-primary shadow-sm ring-1 ring-primary/10">
      {isLeader ? <LuUser className="h-4 w-4" aria-hidden /> : <LuMic className="h-4 w-4" aria-hidden />}
    </span>
  );
}

function MobileSection({
  section,
  months,
}: {
  section: SundayScheduleTableSection;
  months: SundayScheduleTableMonth[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent px-4 py-3.5">
        <div className="flex items-center gap-3">
          <SectionIcon roleTitle={section.roleTitle} />
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-stone-900">{section.roleTitle.replace(':', '')}</h3>
            <p className="text-[11px] font-semibold text-stone-500">Воскресные даты по месяцам</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {months.map((month, index) => (
            <div
              key={month.key}
              className="rounded-xl border border-stone-200/80 bg-white/90 px-2.5 py-2 shadow-sm"
            >
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-primary">{month.label}</p>
              <SundayDaysHint days={section.monthHeaders[index] ?? ''} />
            </div>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-stone-100">
        {section.rows.map((row, index) => (
          <li key={row.memberId} className="px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-extrabold text-stone-600">
                {index + 1}
              </span>
              <span className="min-w-0 text-sm font-extrabold leading-snug text-stone-900">{row.name}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {months.map((month, monthIndex) => (
                <div
                  key={`${row.memberId}-${month.key}`}
                  className="rounded-xl border border-stone-100 bg-stone-50/80 p-2"
                >
                  <p className="mb-1.5 truncate text-[10px] font-extrabold uppercase tracking-wide text-stone-500">
                    {month.label.slice(0, 3)}
                  </p>
                  <DayChips value={row.monthCells[monthIndex] ?? ''} compact />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DesktopTable({ model }: { model: SundayScheduleTableModel }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-stone-50/95">
              <th
                scope="col"
                className="sticky left-0 z-20 w-12 border-b border-stone-200 bg-stone-50/95 px-3 py-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-stone-500"
              >
                №
              </th>
              <th
                scope="col"
                className="sticky left-12 z-20 min-w-[200px] border-b border-stone-200 bg-stone-50/95 px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-stone-500"
              >
                Ф.И.О.
              </th>
              {model.months.map((month) => (
                <th
                  key={month.key}
                  scope="col"
                  className="min-w-[140px] border-b border-stone-200 px-3 py-3 text-center"
                >
                  <span className="text-xs font-extrabold capitalize text-stone-900">{month.label}</span>
                  <SundayDaysHint days={month.sundayDaysLabel} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.sections.map((section) => (
              <Fragment key={section.roleTitle}>
                <tr className="bg-gradient-to-r from-primary/[0.12] via-primary/[0.06] to-transparent">
                  <td
                    colSpan={2}
                    className="sticky left-0 z-10 border-b border-primary/10 bg-gradient-to-r from-primary/[0.12] to-primary/[0.08] px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <SectionIcon roleTitle={section.roleTitle} />
                      <span className="text-sm font-extrabold text-stone-900">
                        {section.roleTitle.replace(':', '')}
                      </span>
                    </div>
                  </td>
                  {section.monthHeaders.map((header, index) => (
                    <td
                      key={`${section.roleTitle}-header-${index}`}
                      className="border-b border-primary/10 px-3 py-3 text-center align-middle"
                    >
                      <p className="text-[10px] font-extrabold uppercase tracking-wide text-primary/80">
                        Воскресенья
                      </p>
                      <SundayDaysHint days={header} />
                    </td>
                  ))}
                </tr>
                {section.rows.map((row, index) => (
                  <tr
                    key={`${section.roleTitle}-${row.memberId}`}
                    className="group transition-colors hover:bg-stone-50/80"
                  >
                    <td className="sticky left-0 z-10 border-b border-stone-100 bg-white px-3 py-3 text-center text-xs font-extrabold text-stone-500 group-hover:bg-stone-50/80">
                      {index + 1}
                    </td>
                    <td className="sticky left-12 z-10 border-b border-stone-100 bg-white px-4 py-3 text-left font-extrabold text-stone-900 group-hover:bg-stone-50/80">
                      {row.name}
                    </td>
                    {row.monthCells.map((cell, cellIndex) => (
                      <td
                        key={`${row.memberId}-${cellIndex}`}
                        className="border-b border-stone-100 px-3 py-3 align-middle"
                      >
                        <DayChips value={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SundayScheduleTableView({
  model,
  loading = false,
  onPrevPeriod,
  onNextPeriod,
  onTodayPeriod,
}: Props) {
  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-stone-200/80 bg-gradient-to-br from-stone-50 to-white py-20">
        <LuLoaderCircle className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!model) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">График служения</p>
          <h2 className="mt-1 text-base font-extrabold leading-snug text-stone-900 sm:text-lg">{model.title}</h2>
        </div>
        {onPrevPeriod && onNextPeriod ? (
          <PeriodNav onPrev={onPrevPeriod} onNext={onNextPeriod} onToday={onTodayPeriod} />
        ) : null}
      </div>

      <div className="hidden lg:block">
        <DesktopTable model={model} />
      </div>

      <div className="space-y-4 lg:hidden">
        {model.sections.map((section) => (
          <MobileSection key={section.roleTitle} section={section} months={model.months} />
        ))}
      </div>
    </div>
    </section>
  );
}
