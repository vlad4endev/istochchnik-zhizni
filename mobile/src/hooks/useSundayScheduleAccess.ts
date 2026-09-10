import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '../api/profile';
import { canViewSundaySchedule } from '../lib/scheduleAccess';
import { useAuthStore } from '../stores/authStore';

export function useSundayScheduleAccess() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const ministryDirection = meQuery.data?.ministry_direction;
  const ministryRole = meQuery.data?.ministry_role;

  return {
    canView: canViewSundaySchedule(role, ministryDirection, ministryRole, roles),
    isLoading: meQuery.isLoading,
  };
}
