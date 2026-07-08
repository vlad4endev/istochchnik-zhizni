import {useEffect, useRef} from 'react';
import NetInfo from '@react-native-community/netinfo';
import BackgroundFetch from 'react-native-background-fetch';

import {runFullSync} from './runFullSync';

const BACKGROUND_TASK_ID = 'com.istochnik.sync';

let syncInFlight: Promise<void> | null = null;

export async function triggerSync(): Promise<void> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runFullSync()
    .catch(err => {
      console.warn('[sync] runFullSync failed', err);
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
      if (wasOffline.current && online) {
        void triggerSync();
      }
      wasOffline.current = !online;
    });

    void NetInfo.fetch().then(state => {
      wasOffline.current = !(state.isConnected && state.isInternetReachable !== false);
      if (!wasOffline.current) {
        void triggerSync();
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
      BackgroundFetch.stop();
    };
  }, [enabled]);
}
