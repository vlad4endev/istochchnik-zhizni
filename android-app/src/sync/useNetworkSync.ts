import {useEffect, useRef} from 'react';
import NetInfo from '@react-native-community/netinfo';
import BackgroundFetch from 'react-native-background-fetch';

import {getSongsCollection} from '../db';
import {listPendingQueueItems} from './syncQueue';
import {runFullSync} from './runFullSync';
import {useSyncStatusStore} from './syncStatusStore';

const BACKGROUND_TASK_ID = 'com.istochnik.sync';

let syncInFlight: Promise<void> | null = null;

async function refreshCounts(): Promise<void> {
  const pending = await listPendingQueueItems();
  const songs = await getSongsCollection().query().fetch();
  useSyncStatusStore.getState().setPendingCount(pending.length);
  useSyncStatusStore
    .getState()
    .setSongCount(songs.filter(s => s.isPublished && !s.isDeleted).length);
}

export async function triggerSync(): Promise<void> {
  if (syncInFlight) return syncInFlight;

  const store = useSyncStatusStore.getState();
  store.beginSync();

  syncInFlight = runFullSync()
    .then(async () => {
      await refreshCounts();
      useSyncStatusStore.getState().endSyncSuccess();
    })
    .catch(err => {
      console.warn('[sync] runFullSync failed', err);
      const message = err instanceof Error ? err.message : 'Ошибка синхронизации';
      useSyncStatusStore.getState().endSyncError(message);
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}

export function useNetworkSync(enabled = true): void {
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      useSyncStatusStore.getState().setOnline(online);
      if (wasOffline.current && online) {
        void triggerSync();
      }
      wasOffline.current = !online;
    });

    void NetInfo.fetch().then(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      useSyncStatusStore.getState().setOnline(online);
      wasOffline.current = !online;
      if (online) {
        void triggerSync();
      } else {
        void refreshCounts();
      }
    });

    return unsubscribe;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onEvent = async (taskId: string) => {
      try {
        await triggerSync();
      } finally {
        BackgroundFetch.finish(taskId);
      }
    };

    const onTimeout = async (taskId: string) => {
      BackgroundFetch.finish(taskId);
    };

    BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      },
      onEvent,
      onTimeout,
    ).catch(err => {
      console.warn('[sync] BackgroundFetch configure failed', err);
    });

    return () => {
      BackgroundFetch.stop(BACKGROUND_TASK_ID).catch(() => undefined);
    };
  }, [enabled]);
}
