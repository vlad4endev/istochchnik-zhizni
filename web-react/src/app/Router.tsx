import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthLandingPage } from '../features/auth/pages/AuthLandingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';

import { DailyPrayerPage } from '../features/calendar/pages/DailyPrayerPage';
import { BroadcastPage } from '../features/broadcast/pages/BroadcastPage';
import { ResourcesRoutes } from '../features/resources/routes/ResourcesRoutes';
import { PodcastsPage } from '../features/resources/pages/PodcastsPage';
import { ServiceFlowPage } from '../features/serviceFlow/pages/ServiceFlowPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';

import { Layout } from './Layout';
import { ProfileRouteBoundary } from './ProfileRouteBoundary';
import { SongbookLayout } from '../features/songbook/SongbookLayout';
import {
  LOGIN_PATH,
  RequireAdmin,
  RequireAuth,
  RequireCatalogModerator,
  RequireFullMember,
  RequireMessengerAccess,
  RequireStudioAccess,
  RouteFallback,
} from './routeGuards';
import { MessengerWsProvider } from '../features/messenger/MessengerWsContext';

/** Отдельные чанки: настройки (`/profile`) и публичная лента (`/profile/:username`) не тянут друг друга. */
const LazyProfilePage = lazy(async () => {
  const m = await import('@features/profile/pages/ProfilePage');
  return { default: m.ProfilePage };
});

const LazyPublicProfilePage = lazy(async () => {
  const m = await import('@features/profile/pages/PublicProfilePage');
  return { default: m.PublicProfilePage };
});

const AdminPage = lazy(async () => {
  const m = await import('../features/admin/pages/AdminPage');
  return { default: m.AdminPage };
});

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

const SongbookPage = lazy(async () => {
  const m = await import('../features/songbook/pages/SongbookPage');
  return { default: m.SongbookPage };
});

const SongDetailPage = lazy(async () => {
  const m = await import('../features/songbook/pages/SongDetailPage');
  return { default: m.SongDetailPage };
});

const AddSongPage = lazy(async () => {
  const m = await import('../features/songbook/pages/AddSongPage');
  return { default: m.AddSongPage };
});

const StudioEditor = lazy(async () => {
  const m = await import('../features/songbook/studio/StudioEditor');
  return { default: m.StudioEditor };
});

const PublicSetlistPage = lazy(async () => {
  const m = await import('../features/studio/pages/PublicSetlistPage');
  return { default: m.PublicSetlistPage };
});

const MessengerRoutes = lazy(async () => {
  const m = await import('../features/messenger/routes/MessengerRoutes');
  return { default: m.MessengerRoutes };
});


export function AppRouter() {
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

        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="prayer"
          element={
            <RequireFullMember>
              <DailyPrayerPage />
            </RequireFullMember>
          }
        />
        <Route
          path="messenger/*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <RequireMessengerAccess>
                <MessengerWsProvider>
                  <MessengerRoutes />
                </MessengerWsProvider>
              </RequireMessengerAccess>
            </Suspense>
          }
        />
        <Route
          path="broadcast"
          element={
            <RequireFullMember>
              <BroadcastPage />
            </RequireFullMember>
          }
        />
        <Route
          path="sermons"
          element={
            <RequireFullMember>
              <PodcastsPage />
            </RequireFullMember>
          }
        />
        <Route
          path="resources/*"
          element={
            <RequireFullMember>
              <ResourcesRoutes />
            </RequireFullMember>
          }
        />
        <Route
          path="service-flow"
          element={
            <RequireFullMember>
              <ServiceFlowPage />
            </RequireFullMember>
          }
        />
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
            path="add"
            element={
              <RequireCatalogModerator>
                <Suspense fallback={<RouteFallback />}>
                  <AddSongPage />
                </Suspense>
              </RequireCatalogModerator>
            }
          />
          <Route
            path="studio/edit/:songId"
            element={
              <RequireStudioAccess>
                <Suspense fallback={<RouteFallback />}>
                  <StudioEditor />
                </Suspense>
              </RequireStudioAccess>
            }
          />
          <Route
            path="studio"
            element={
              <RequireStudioAccess>
                <Suspense fallback={<RouteFallback />}>
                  <StudioMySongsPage />
                </Suspense>
              </RequireStudioAccess>
            }
          />
          <Route
            path="setlists/:id/perform"
            element={
              <RequireStudioAccess>
                <Suspense fallback={<RouteFallback />}>
                  <StudioPerformPage />
                </Suspense>
              </RequireStudioAccess>
            }
          />
          <Route
            path="setlists/:id"
            element={
              <RequireStudioAccess>
                <Suspense fallback={<RouteFallback />}>
                  <StudioSetlistDetailPage />
                </Suspense>
              </RequireStudioAccess>
            }
          />
          <Route
            path="setlists"
            element={
              <RequireStudioAccess>
                <Suspense fallback={<RouteFallback />}>
                  <StudioSetlistsPage />
                </Suspense>
              </RequireStudioAccess>
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
        <Route
          path="profile"
          element={
            <RequireFullMember>
              <ProfileRouteBoundary moduleName="настройки профиля" fallback={<RouteFallback />}>
                <LazyProfilePage />
              </ProfileRouteBoundary>
            </RequireFullMember>
          }
        />
        <Route
          path="profile/:username"
          element={
            <RequireFullMember>
              <ProfileRouteBoundary moduleName="профиль" fallback={<RouteFallback />}>
                <LazyPublicProfilePage />
              </ProfileRouteBoundary>
            </RequireFullMember>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <Suspense fallback={<RouteFallback />}>
                <AdminPage />
              </Suspense>
            </RequireAdmin>
          }
        />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
