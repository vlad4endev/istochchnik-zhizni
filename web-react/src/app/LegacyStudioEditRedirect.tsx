import { Navigate, useLocation, useParams } from 'react-router-dom';

import { isStudioDeploy } from '../lib/appVariant';

/** Старые ссылки `/studio/edit/:id` ведут на единый редактор в песеннике. */
export function LegacyStudioEditRedirect() {
  const { songId } = useParams<{ songId: string }>();
  const location = useLocation();
  const stateBackTo = (location.state as { backTo?: string } | null)?.backTo;
  const defaultBack = isStudioDeploy() ? '/studio/my-songs' : '/songbook/studio';
  const backTo = typeof stateBackTo === 'string' && stateBackTo.startsWith('/') ? stateBackTo : defaultBack;

  if (!songId) {
    return <Navigate to={defaultBack} replace />;
  }
  return <Navigate to={`/songbook/studio/edit/${songId}`} replace state={{ backTo }} />;
}
