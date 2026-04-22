import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthLandingPage } from '../features/auth/pages/AuthLandingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { PendingReviewPage } from '../features/auth/pages/PendingReviewPage';
import { SongbookLayout } from '../features/songbook/SongbookLayout';
import {
  LOGIN_PATH,
  RequireAuth,
  RequireFullMember,
  RouteFallback,
} from './routeGuards';

const SongbookPage = lazy(async () => {
  const m = await import('../features/songbook/pages/SongbookPage');
  return { default: m.SongbookPage };
});

const SongDetailPage = lazy(async () => {
  const m = await import('../features/songbook/pages/SongDetailPage');
  return { default: m.SongDetailPage };
});

const PublicSetlistPage = lazy(async () => {
  const m = await import('../features/studio/pages/PublicSetlistPage');
  return { default: m.PublicSetlistPage };
});

const PublicServicePlanPage = lazy(async () => {
  const m = await import('../features/servicePlanner/pages/PublicServicePlanPage');
  return { default: m.PublicServicePlanPage };
});

/** Только просмотр песенника + публичные сетлисты (основной домен). */
export function AppRouterMain() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<AuthLandingPage />} />
      <Route path={`${LOGIN_PATH}/form`} element={<LoginPage />} />

      <Route
        path="/setlist-share/:token"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PublicSetlistPage />
          </Suspense>
        }
      />
      <Route
        path="/service-plan/share/:token"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PublicServicePlanPage />
          </Suspense>
        }
      />
      <Route element={<RequireAuth />}>
        <Route path="/pending-review" element={<PendingReviewPage />} />
        <Route index element={<Navigate to="/songbook" replace />} />
        <Route
          path="songbook"
          element={
            <RequireFullMember>
              <SongbookLayout />
            </RequireFullMember>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <SongbookPage />
              </Suspense>
            }
          />
          <Route
            path=":id"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SongDetailPage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/songbook" replace />} />
      </Route>
    </Routes>
  );
}
