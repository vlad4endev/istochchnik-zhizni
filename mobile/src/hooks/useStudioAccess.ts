import { useQuery } from '@tanstack/react-query';

import { fetchMe } from '../api/profile';
import { canRoleAccessSection, fetchSectionVisibilitySettings } from '../api/sectionVisibility';
import { canAccessStudio } from '../lib/studioAccess';
import { useAuthStore } from '../stores/authStore';

export function useStudioAccess() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);

  const settingsQuery = useQuery({
    queryKey: ['settings', 'sections'],
    queryFn: fetchSectionVisibilitySettings,
    staleTime: 5 * 60_000,
  });

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const sectionOk = canRoleAccessSection(settingsQuery.data, 'studio', role, roles);
  const studioOk = canAccessStudio(role, meQuery.data?.ministry_direction, roles);

  return {
    canView: sectionOk && studioOk,
    isLoading: settingsQuery.isLoading || meQuery.isLoading,
  };
}
