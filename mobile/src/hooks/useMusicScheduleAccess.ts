import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '../api/profile';
import { canManageMusicSchedule, canViewMusicSchedule } from '../lib/scheduleAccess';
import { useAuthStore } from '../stores/authStore';

export function useMusicScheduleAccess() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const ministryDirection = meQuery.data?.ministry_direction;
  const ministryRole = meQuery.data?.ministry_role;

  return {
    canView: canViewMusicSchedule(role, ministryDirection, roles, ministryRole),
    canManage: canManageMusicSchedule(role, ministryRole, roles),
    isLoading: meQuery.isLoading,
  };
}
