import { useEffect } from 'react';

import { dispatchLayoutMainChrome } from '../../app/layoutChrome';

/**
 * На мобильных скрывает нижний таббар основного приложения,
 * когда студия показывает свой dock (редактор, мастер песни).
 */
export function useStudioAppChrome(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const mq = window.matchMedia('(max-width: 1023px)');

    const apply = () => {
      dispatchLayoutMainChrome(!mq.matches);
    };

    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      dispatchLayoutMainChrome(true);
    };
  }, [enabled]);
}
