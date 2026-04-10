import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthLandingPage } from '../features/auth/pages/AuthLandingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { PendingReviewPage } from '../features/auth/pages/PendingReviewPage';
import {
  LOGIN_PATH,
  RequireAuth,
  RequireCatalogModerator,
  RequireFullMember,
  RequireStudioAccess,
  RouteFallback,
} from './routeGuards';

const StudioLayout = lazy(async () => {
  const m = await import('../features/studio/StudioLayout');
  return { default: m.StudioLayout };
});

const StudioMySongsPage = lazy(async () => {
  const m = await import('../features/studio/pages/MySongsPage');
  return { default: m.MySongsPage };
});

const StudioSetlistsPage = lazy(async () => {
  const m = await import('../features/studio/pages/SetlistsPage');
  return { default: m.SetlistsPage };
});

const StudioSetlistDetailPage = lazy(async () => {
  const m = await import('../features/studio/pages/SetlistDetailPage');
  return { default: m.SetlistDetailPage };
});

const StudioPerformPage = lazy(async () => {
  const m = await import('../features/studio/pages/PerformPage');
  return { default: m.PerformPage };
});

const StudioInstrumentsPage = lazy(async () => {
  const m = await import('../features/studio/pages/InstrumentsPage');
  return { default: m.InstrumentsPage };
});

const StudioEditPage = lazy(async () => {
  const m = await import('../features/studio/pages/StudioEditPage');
  return { default: m.StudioEditPage };
});

const AddSongPage = lazy(async () => {
  const m = await import('../features/songbook/pages/AddSongPage');
  return { default: m.AddSongPage };
});

const PublicSetlistPage = lazy(async () => {
  const m = await import('../features/studio/pages/PublicSetlistPage');
  return { default: m.PublicSetlistPage };
});

/** Редактор, сетлисты, роли — поддомен studio. */
export function AppRouterStudio() {
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

      <Route element={<RequireAuth />}>
        <Route path="/pending-review" element={<PendingReviewPage />} />
        <Route
          path="studio"
          element={
            <RequireFullMember>
              <RequireStudioAccess>
                <Suspense fallback={<RouteFallback />}>
                  <StudioLayout />
                </Suspense>
              </RequireStudioAccess>
            </RequireFullMember>
          }
        >
          <Route index element={<Navigate to="my-songs" replace />} />
          <Route
            path="my-songs"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioMySongsPage />
              </Suspense>
            }
          />
          <Route path="drafts" element={<Navigate to="/studio/my-songs" replace />} />
          <Route
            path="setlists"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioSetlistsPage />
              </Suspense>
            }
          />
          <Route
            path="setlists/:id/perform"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioPerformPage />
              </Suspense>
            }
          />
          <Route
            path="setlists/:id"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioSetlistDetailPage />
              </Suspense>
            }
          />
          <Route
            path="instruments"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioInstrumentsPage />
              </Suspense>
            }
          />
          <Route
            path="edit/:songId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioEditPage />
              </Suspense>
            }
          />
          <Route
            path="add-song"
            element={
              <RequireCatalogModerator>
                <Suspense fallback={<RouteFallback />}>
                  <AddSongPage />
                </Suspense>
              </RequireCatalogModerator>
            }
          />
        </Route>
        <Route index element={<Navigate to="/studio/my-songs" replace />} />
        <Route path="*" element={<Navigate to="/studio/my-songs" replace />} />
      </Route>
    </Routes>
  );
}
