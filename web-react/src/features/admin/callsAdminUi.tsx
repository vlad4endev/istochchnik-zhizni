import { AppAvatar } from '../../components/AppAvatar';

/** Общие UI-хелперы админки звонков (настройки, статистика, журнал). */

export function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-[var(--text-muted)]'
  );
}

export function btnPrimary(c = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

export function btnSecondary(c = '') {
  return `rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface)] ${c}`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${r}с`;
  return `${r}с`;
}

export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function qualityBadge(score: number | null | undefined) {
  if (score == null) return <span className="text-stone-400">нет данных</span>;
  const color =
    score >= 4
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 2.5
        ? 'bg-amber-100 text-amber-900'
        : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score.toFixed(1)} / 5
    </span>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function PersonAvatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const initials = initialsOf(name);
  return (
    <AppAvatar
      src={src || null}
      fallback={<span className="text-[10px] font-semibold text-stone-600">{initials}</span>}
      initialsFallbackText={initials}
      initialsColorSeed={name}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200"
      imgClassName="h-full w-full object-cover"
      style={{ width: size, height: size }}
      width={size}
      height={size}
    />
  );
}
