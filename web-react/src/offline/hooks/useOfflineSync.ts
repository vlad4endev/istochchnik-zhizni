import { useEffect, useState } from 'react';

import { useAuthStore } from '../../features/auth/authStore';
import { getStorageAdapter } from '../storage/adapter';
import { bindSyncTriggers, bootstrapOfflineSnapshot, runSyncCycle } from '../sync/syncEngine';

export function useOfflineSync(): { lastSyncAt: string | null; pendingCount: number } {
  const token = useAuthStore((s) => s.token);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    bindSyncTriggers();
    let cancelled = false;
    void (async () => {
      try {
        const adapter = getStorageAdapter();
        const bootstrapped = await adapter.getMeta('bootstrapped');
        if (!bootstrapped) {
          await bootstrapOfflineSnapshot();
          await adapter.setMeta('bootstrapped', '1');
        }
        await runSyncCycle();
      } catch {
        /* offline / API down */
      }
      if (cancelled) return;
      const adapter = getStorageAdapter();
      setLastSyncAt(await adapter.getMeta('last_sync_at'));
      const pending = await adapter.listOutboxPending(200);
      setPendingCount(pending.length);
    })();
    const t = window.setInterval(() => {
      void (async () => {
        const adapter = getStorageAdapter();
        setLastSyncAt(await adapter.getMeta('last_sync_at'));
        setPendingCount((await adapter.listOutboxPending(200)).length);
      })();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [token]);

  return { lastSyncAt, pendingCount };
}
