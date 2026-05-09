import { Navigate, useParams } from 'react-router-dom';

/** Старые ссылки `/studio/edit/:id` ведут на единый редактор в песеннике. */
export function LegacyStudioEditRedirect() {
  const { songId } = useParams<{ songId: string }>();
  if (!songId) {
    return <Navigate to="/songbook/studio" replace />;
  }
  return <Navigate to={`/songbook/studio/edit/${songId}`} replace />;
}
