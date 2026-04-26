import type { CSSProperties, ReactNode } from 'react';

export const PANEL_CLASS =
  'rounded-xl border border-[color:var(--color-border,rgba(122,31,46,0.18))] bg-[var(--color-background-secondary)]/92 p-4 shadow-[0_8px_24px_rgba(20,10,15,0.06)]';
export const SURFACE_CLASS =
  'border border-[color:var(--color-border,rgba(122,31,46,0.14))] bg-[var(--color-background-primary)]/88';
export const TOOLTIP_STYLE: CSSProperties = {
  border: '1px solid rgba(180,94,110,0.25)',
  borderRadius: 10,
  backgroundColor: 'var(--color-background-primary)',
};

export function KpiCard({
  title,
  value,
  delta,
  suffix,
  isOnline,
}: {
  title: string;
  value: number;
  delta: number;
  suffix?: string;
  isOnline?: boolean;
}) {
  const isPositive = delta >= 0;
  return (
    <div className={`${PANEL_CLASS} transition hover:translate-y-[-1px]`}>
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {title}
        {isOnline ? <PulseDot /> : null}
      </div>
      <div className="text-[28px] font-semibold leading-none">
        {formatNumber(value)}
        {suffix ?? ''}
      </div>
      <div className={`mt-2 text-xs ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
        {isPositive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
      </div>
    </div>
  );
}

export function Panel({ title, className, children }: { title: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`${PANEL_CLASS} ${className ?? ''}`}>
      <h2 className="mb-4 border-b border-[color:var(--color-border,rgba(122,31,46,0.12))] pb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function PulseDot() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

export function AvatarInitials({ name }: { name?: string | null }) {
  const initials = getInitials(name);
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7a1f2e]/20 text-xs font-semibold text-[#7a1f2e]">
      {initials}
    </div>
  );
}

export function InlineApiError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200 md:flex-row md:items-center md:justify-between">
      <span>Сервер вернул ошибку 500. Попробуйте повторить запрос.</span>
      <button
        type="button"
        onClick={onRetry}
        className="w-fit rounded-lg bg-[#7a1f2e] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        Повторить
      </button>
    </div>
  );
}

export function ChartSkeleton({ loading, children }: { loading: boolean; children: ReactNode }) {
  if (loading) {
    return <div className={`h-72 animate-pulse rounded-xl ${SURFACE_CLASS}`} />;
  }
  return <>{children}</>;
}

export function KpiSkeleton() {
  return <div className={`h-[116px] animate-pulse rounded-xl ${SURFACE_CLASS}`} />;
}

export function SafeChart({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  try {
    return <>{children}</>;
  } catch {
    return <>{fallback}</>;
  }
}

export function NoChartData({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{ minWidth: 0, height: compact ? 120 : 280 }}
      className={`flex items-center justify-center rounded-lg border-dashed text-sm text-[var(--color-text-muted)] ${SURFACE_CLASS}`}
    >
      Нет данных
    </div>
  );
}

export function is500Error(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeResponse = (error as { response?: { status?: number } }).response;
  return maybeResponse?.status === 500;
}

export function formatNumber(value: number): string {
  return Number(value ?? 0).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}

export function formatMinutesAgo(value?: number | null): string {
  const minutes = Math.max(0, Number(value ?? 0));
  if (minutes < 1) return 'только что';
  return `${formatNumber(Math.round(minutes))} мин назад`;
}

function getInitials(name?: string | null): string {
  const source = (name ?? '').trim();
  if (!source) return '??';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
