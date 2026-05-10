import { parse } from 'date-fns';

function isTodayDate(value) {
  const dt = parse(String(value ?? ''), 'yyyy-MM-dd', new Date());
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  return dt.getDate() === now.getDate() && dt.getMonth() === now.getMonth();
}

export default function BirthdayCard({ birthdays = [] }) {
  return (
    <section className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <h3 className="text-sm font-extrabold uppercase tracking-[0.08em] text-stone-700">Дни рождения</h3>

      {birthdays.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Ближайших дней рождения нет</p>
      ) : (
        <>
          <div className="mt-3 hidden flex-col gap-2 lg:flex">
            {birthdays.map((birthday) => (
              <div key={birthday.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">{birthday.name}</p>
                  <p className="text-xs text-stone-600">{birthday.label}</p>
                </div>
                {isTodayDate(birthday.weekDate) ? (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">сегодня</span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="scrollbar-hide -mx-1 mt-3 overflow-x-auto px-1 lg:hidden">
            <div className="flex w-max gap-2">
              {birthdays.map((birthday) => (
                <div key={birthday.id} className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-3 py-2">
                  <p className="text-sm font-semibold text-stone-900">{birthday.name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-xs text-stone-600">{birthday.label}</p>
                    {isTodayDate(birthday.weekDate) ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">сегодня</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
