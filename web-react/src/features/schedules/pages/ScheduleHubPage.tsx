import { Navigate } from 'react-router-dom';

import { useAuthStore } from '../../auth/authStore';
import { useMe } from '../../../hooks/useMe';
import {
  listAccessibleScheduleMinistries,
  schedulePathForMinistry,
} from '../ministryScheduleAccess';

export function ScheduleHubPage() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));

  const ministries = listAccessibleScheduleMinistries(
    role,
    meQ.data?.ministry_direction,
    meQ.data?.ministry_role,
    roles,
  );

  if (meQ.isLoading) return null;
  if (ministries.length === 0) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to={schedulePathForMinistry(ministries[0]!)} replace />;
}
