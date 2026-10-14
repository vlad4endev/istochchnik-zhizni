import { useOfflineSync } from '../offline/hooks/useOfflineSync';

/** Compact offline sync indicator for settings / songbook chrome. */
export function SyncStatusBadge() {
  const { lastSyncAt, pendingCount } = useOfflineSync();
  let label = 'Синхронизировано';
  if (pendingCount > 0) label = `Ожидает отправки: ${pendingCount}`;
  else if (!lastSyncAt) label = 'Локально';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
      title={lastSyncAt ? `Последняя синхронизация: ${lastSyncAt}` : 'Ещё не синхронизировано'}
      data-testid="sync-status-badge"
    >
      <span
        className={
          pendingCount > 0
            ? 'h-1.5 w-1.5 rounded-full bg-amber-500'
            : 'h-1.5 w-1.5 rounded-full bg-emerald-600'
        }
        aria-hidden
      />
      {label}
    </span>
  );
}
