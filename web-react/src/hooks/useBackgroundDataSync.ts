import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { onAppBackgroundResume } from '../lib/appBackgroundResume';

/**
 * После возврата в PWA/вкладку — мягко обновить активные запросы.
 * Глобально `refetchOnReconnect: false` (не бить API лавиной на iOS), здесь — точечно.
 */
export function useBackgroundDataSync(): null {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    return onAppBackgroundResume(() => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const root = query.queryKey[0];
          return root === 'notifications' || root === 'auth-session-hints';
        },
        refetchType: 'active',
      });

      window.dispatchEvent(new CustomEvent('app:background-resume'));
    });
  }, [token, queryClient]);

  return null;
}
