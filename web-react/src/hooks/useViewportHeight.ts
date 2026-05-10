import { useEffect } from 'react';

import { applyNativeShellViewportLock, syncViewportHeightVars } from '../lib/nativeShellViewport';

/**
 * Синхронизирует `--viewport-height` / `--vh` с `visualViewport` (iOS PWA + клавиатура).
 * Слушатели навешиваются один раз в `applyNativeShellViewportLock` (см. `main.tsx`).
 */
export function useViewportHeight() {
  useEffect(() => {
    applyNativeShellViewportLock();
    syncViewportHeightVars();
  }, []);
}
