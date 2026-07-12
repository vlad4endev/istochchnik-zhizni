import { useEffect } from 'react';

import { acquireMobileBottomNavLock, releaseMobileBottomNavLock } from './layoutChrome';

/** На ширине <1024px скрывает нижний таб-бар, пока открыта модалка/лист. */
export function useMobileBottomNavLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquireMobileBottomNavLock();
    return releaseMobileBottomNavLock;
  }, [active]);
}
