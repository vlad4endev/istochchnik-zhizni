import {create} from 'zustand';

export type SyncPhase = 'idle' | 'syncing' | 'error';

interface SyncStatusState {
  phase: SyncPhase;
  isOnline: boolean;
  lastSuccessAt: number | null;
  lastError: string | null;
  pendingCount: number;
  songCount: number;
  setOnline: (online: boolean) => void;
  setPendingCount: (n: number) => void;
  setSongCount: (n: number) => void;
  beginSync: () => void;
  endSyncSuccess: () => void;
  endSyncError: (message: string) => void;
}

export const useSyncStatusStore = create<SyncStatusState>(set => ({
  phase: 'idle',
  isOnline: true,
  lastSuccessAt: null,
  lastError: null,
  pendingCount: 0,
  songCount: 0,
  setOnline: online => set({isOnline: online}),
  setPendingCount: n => set({pendingCount: n}),
  setSongCount: n => set({songCount: n}),
  beginSync: () => set({phase: 'syncing', lastError: null}),
  endSyncSuccess: () =>
    set({
      phase: 'idle',
      lastSuccessAt: Date.now(),
      lastError: null,
    }),
  endSyncError: message =>
    set({
      phase: 'error',
      lastError: message,
    }),
}));
