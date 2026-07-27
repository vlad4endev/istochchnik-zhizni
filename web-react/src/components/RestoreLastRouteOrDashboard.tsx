import { Navigate, useLocation } from 'react-router-dom';
import { useRef } from 'react';

import { isPersistableAppPath, readLastAppRoute } from '@/lib/persistAppLocation';

/**
 * При холодном старте на `/` (типично для Capacitor / PWA) возвращаем
 * последний сохранённый маршрут вместо принудительного `/dashboard`.
 */
export function RestoreLastRouteOrDashboard() {
  const location = useLocation();
  const decidedRef = useRef(false);
  const targetRef = useRef('/dashboard');

  if (!decidedRef.current) {
    decidedRef.current = true;
    const last = readLastAppRoute();
    if (
      last &&
      isPersistableAppPath(last) &&
      last !== '/dashboard' &&
      last !== '/dashboard/' &&
      last !== '/' &&
      !location.search &&
      !location.hash
    ) {
      targetRef.current = last;
    }
  }

  return <Navigate to={targetRef.current} replace />;
}
