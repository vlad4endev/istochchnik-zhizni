const badgeClasses = {
  urgent: 'bg-rose-100 text-rose-700',
  active: 'bg-blue-100 text-blue-700',
  praise: 'bg-emerald-100 text-emerald-700',
};

const badgeLabels = {
  urgent: 'срочная',
  active: 'активная',
  praise: 'хвала',
};

export default function PrayerCard({ prayers = [], unreadCount = 0 }) {
  const rows = prayers.slice(0, 3);

  return (
    <section className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold uppercase tracking-[0.08em] text-stone-700">Молитвенные нужды</h3>
        {unreadCount > 0 ? (
          <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Новых нужд пока нет</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClasses[row.type] ?? badgeClasses.active}`}>
                  {badgeLabels[row.type] ?? badgeLabels.active}
                </span>
                <p className="truncate text-xs font-semibold text-stone-600">{row.title}</p>
              </div>
              <p className="mt-1 text-sm text-stone-800">{row.text}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
