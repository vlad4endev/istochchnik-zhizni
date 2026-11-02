import { useNavigationContainerRef } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { trackHeartbeat, trackScreenView } from '../api/analytics';

const HEARTBEAT_INTERVAL_MS = 60_000;

const PAGE_KEY_BY_ROUTE: Record<string, string> = {
  Dashboard: 'dashboard',
  Prayer: 'prayer',
  PrayerCyclePlan: 'prayer',
  Chats: 'messenger',
  ChatThread: 'messenger',
  NewChat: 'messenger',
  Songbook: 'songbook',
  SongDetail: 'songbook',
  Sermons: 'sermons',
  Settings: 'settings',
  Events: 'events',
  MediaSchedule: 'schedules',
  ServicePlanner: 'service_planner',
  ServicePlanDetail: 'service_planner',
  Studio: 'studio',
  StudioSetlistDetail: 'studio',
  StudioPerform: 'studio',
  Bible: 'bible',
  BibleReader: 'bible',
};

function pageKeyForRoute(routeName: string): string {
  return PAGE_KEY_BY_ROUTE[routeName] ?? 'other';
}

type CurrentScreen = {
  name: string;
  pageKey: string;
  startedAt: number;
};

/**
 * Трекинг экранов: один «визит» = показ экрана между переходами/уходом в фон.
 * Длительность отправляется при смене экрана или сворачивании приложения;
 * heartbeat раз в минуту поддерживает точный статус «онлайн».
 */
export function useScreenTracking() {
  const navigationRef = useNavigationContainerRef();
  const currentRef = useRef<CurrentScreen | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const flushCurrent = useCallback(() => {
    const current = currentRef.current;
    if (!current) return;
    currentRef.current = null;
    const durationSeconds = (Date.now() - current.startedAt) / 1000;
    void trackScreenView(current.pageKey, current.name, durationSeconds);
  }, []);

  const captureCurrent = useCallback(() => {
    const route = navigationRef.getCurrentRoute() as { name: string } | undefined;
    if (!route) return;
    const name = String(route.name);
    currentRef.current = { name, pageKey: pageKeyForRoute(name), startedAt: Date.now() };
  }, [navigationRef]);

  const handleReady = useCallback(() => {
    captureCurrent();
  }, [captureCurrent]);

  const handleStateChange = useCallback(() => {
    if (appStateRef.current !== 'active') return;
    flushCurrent();
    captureCurrent();
  }, [flushCurrent, captureCurrent]);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (appStateRef.current === 'active' && currentRef.current) {
        void trackHeartbeat(currentRef.current.pageKey);
      }
    }, HEARTBEAT_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;
      if ((nextState === 'background' || nextState === 'inactive') && previous === 'active') {
        flushCurrent();
      } else if (nextState === 'active' && previous !== 'active') {
        captureCurrent();
      }
    });

    return () => {
      clearInterval(heartbeat);
      subscription.remove();
    };
  }, [flushCurrent, captureCurrent]);

  return { navigationRef, handleReady, handleStateChange };
}
