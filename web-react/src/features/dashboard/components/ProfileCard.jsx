function initials(firstName, lastName, fullName) {
  const source = `${firstName ?? ''} ${lastName ?? ''}`.trim() || String(fullName ?? '').trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'U';
  return parts.map((item) => item[0]?.toUpperCase() ?? '').join('');
}

function roleLabel(role) {
  const value = String(role ?? '').toLowerCase();
  if (value === 'admin') return 'Администратор';
  if (value === 'pastor') return 'Пастор';
  if (value === 'leader') return 'Лидер';
  return 'Участник';
}

export default function ProfileCard({ user }) {
  const fullName = user?.fullName || 'Участник';
  const postsCount = Number.isFinite(user?.postsCount) ? user.postsCount : null;

  return (
    <section className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 text-sm font-bold text-primary">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{initials(user?.firstName, user?.lastName, user?.fullName)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold text-stone-900">{fullName}</p>
          <p className="mt-1 text-sm font-medium text-stone-600">{roleLabel(user?.role)}</p>
          <p className="mt-1 text-sm text-stone-600">{user?.ministry ? user.ministry : '—'}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-stone-200/70 bg-stone-50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">Публикации в Моя страница</p>
        <p className="mt-1 text-lg font-extrabold text-stone-900">{postsCount != null ? postsCount : '—'}</p>
      </div>
    </section>
  );
}
