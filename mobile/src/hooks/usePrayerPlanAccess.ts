import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '../api/profile';
import {
  canManageCoordinatorNotes,
  canTelegramPrayerDispatch,
  canViewPrayerCyclePlan,
  canViewPrayerViewers,
} from '../lib/prayerAccess';
import { useAuthStore } from '../stores/authStore';

export function usePrayerPlanAccess() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  });

  return {
    canManage: canViewPrayerCyclePlan(role, roles, meQuery.data),
    canManageNotes: canManageCoordinatorNotes(role, roles, meQuery.data),
    canTelegram: canTelegramPrayerDispatch(role, roles),
    canViewViewers: canViewPrayerViewers(role, roles),
    memberId: useAuthStore((s) => s.memberId),
    isLoading: meQuery.isLoading,
  };
}
