import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '../api/profile';
import { canManageMediaSchedule, canViewMediaSchedule } from '../lib/mediaAccess';
import { useAuthStore } from '../stores/authStore';

export function useMediaScheduleAccess() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const ministryDirection = meQuery.data?.ministry_direction;
  const ministryRole = meQuery.data?.ministry_role;

  return {
    canView: canViewMediaSchedule(role, ministryDirection, roles),
    canManage: canManageMediaSchedule(role, ministryRole, roles),
    isLoading: meQuery.isLoading,
  };
}
