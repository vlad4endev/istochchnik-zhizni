import { useQuery } from '@tanstack/react-query';

import {
  canRoleAccessSection,
  fetchSectionVisibilitySettings,
} from '../api/sectionVisibility';
import { useAuthStore } from '../stores/authStore';

export function useServicePlannerAccess() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);

  const settingsQuery = useQuery({
    queryKey: ['settings', 'sections'],
    queryFn: fetchSectionVisibilitySettings,
    staleTime: 5 * 60_000,
  });

  const canView = canRoleAccessSection(
    settingsQuery.data,
    'service_planner',
    role,
    roles,
  );

  return {
    canView,
    isLoading: settingsQuery.isLoading,
  };
}
