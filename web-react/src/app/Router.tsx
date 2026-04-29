import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthLandingPage } from '../features/auth/pages/AuthLandingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';

import { Layout } from './Layout';
import { ModuleErrorBoundary } from './ModuleErrorBoundary';
import { ProfileRouteBoundary } from './ProfileRouteBoundary';
import { usePageTracking } from '../hooks/usePageTracking';
import {
  LOGIN_PATH,
  RequireAdmin,
  RequireAuth,
  RequireCatalogModerator,
  RequireFullMember,
  RequireMessengerAccess,
  RequireSectionAccess,
  RequireStudioAccess,
  RouteFallback,
} from './routeGuards';

/** Отдельные чанки: настройки (`/profile`) и публичная лента (`/profile/:username`) не тянут друг друга. */
const LazyProfilePage = lazy(async () => {
  const m = await import('@features/profile/pages/ProfilePage');
  return { default: m.ProfilePage };
});

const LazyPublicProfilePage = lazy(async () => {
  const m = await import('@features/profile/pages/PublicProfilePage');
  return { default: m.PublicProfilePage };
});

const DashboardPage = lazy(async () => {
  const m = await import('../features/dashboard/pages/DashboardPage');
  return { default: m.DashboardPage };
});

const DailyPrayerPage = lazy(async () => {
  const m = await import('../features/calendar/pages/DailyPrayerPage');
  return { default: m.DailyPrayerPage };
});

const BroadcastPage = lazy(async () => {
  const m = await import('../features/broadcast/pages/BroadcastPage');
  return { default: m.BroadcastPage };
});

const PodcastsPage = lazy(async () => {
  const m = await import('../features/resources/pages/PodcastsPage');
  return { default: m.PodcastsPage };
});

const ResourcesRoutes = lazy(async () => {
  const m = await import('../features/resources/routes/ResourcesRoutes');
  return { default: m.ResourcesRoutes };
});

const ServiceFlowPage = lazy(async () => {
  const m = await import('../features/serviceFlow/pages/ServiceFlowPage');
  return { default: m.ServiceFlowPage };
});

const SongbookLayout = lazy(async () => {
  const m = await import('../features/songbook/SongbookLayout');
  return { default: m.SongbookLayout };
});

const MessengerRoutes = lazy(async () => {
  const m = await import('../features/messenger/routes/MessengerRoutes');
  return { default: m.MessengerRoutes };
});

const AdminPage = lazy(async () => {
  const m = await import('../features/admin/pages/AdminPage');
  return { default: m.AdminPage };
});

const AnalyticsPage = lazy(async () => {
  const m = await import('../pages/admin/AnalyticsPage');
  return { default: m.AnalyticsPage };
});
const SettingsPage = lazy(async () => {
  const m = await import('../pages/SettingsPage');
  return { default: m.SettingsPage };
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

const PublicServicePlanPage = lazy(async () => {
  const m = await import('../features/servicePlanner/pages/PublicServicePlanPage');
  return { default: m.PublicServicePlanPage };
});

const EditableServicePlanPage = lazy(async () => {
  const m = await import('../features/servicePlanner/pages/EditableServicePlanPage');
  return { default: m.EditableServicePlanPage };
});

const ServicePlannerPage = lazy(async () => {
  const m = await import('../features/servicePlanner/pages/ServicePlannerPage');
  return { default: m.ServicePlannerPage };
});

export function AppRouter() {
  usePageTracking();
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
      <Route
        path="/service-plan/edit/:token"
        element={
          <Suspense fallback={<RouteFallback />}>
            <EditableServicePlanPage />
          </Suspense>
        }
      />
      <Route element={<RequireAuth />}>
        <Route
          path="studio"
          element={
            <RequireFullMember>
              <RequireSectionAccess sectionId="studio">
                <RequireStudioAccess>
                  <Suspense fallback={<RouteFallback />}>
                    <StudioLayout />
                  </Suspense>
                </RequireStudioAccess>
              </RequireSectionAccess>
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
                <ModuleErrorBoundary moduleName="добавление песни">
                  <Suspense fallback={<RouteFallback />}>
                    <AddSongPage />
                  </Suspense>
                </ModuleErrorBoundary>
              </RequireCatalogModerator>
            }
          />
        </Route>

        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <RequireSectionAccess sectionId="dashboard">
                <Suspense fallback={<RouteFallback />}>
                  <DashboardPage />
                </Suspense>
              </RequireSectionAccess>
            }
          />
          <Route
            path="prayer"
          element={
            <RequireFullMember>
              <RequireSectionAccess sectionId="prayer">
                <Suspense fallback={<RouteFallback />}>
                  <DailyPrayerPage />
                </Suspense>
              </RequireSectionAccess>
            </RequireFullMember>
          }
        />
        <Route
          path="messenger/*"
          element={
            <RequireMessengerAccess>
              <RequireSectionAccess sectionId="messenger">
                <Suspense fallback={<RouteFallback />}>
                  <MessengerRoutes />
                </Suspense>
              </RequireSectionAccess>
            </RequireMessengerAccess>
          }
        />
        <Route
          path="broadcast"
          element={
            <RequireFullMember>
              <Suspense fallback={<RouteFallback />}>
                <BroadcastPage />
              </Suspense>
            </RequireFullMember>
          }
        />
        <Route
          path="sermons"
          element={
            <RequireFullMember>
              <RequireSectionAccess sectionId="sermons">
                <Suspense fallback={<RouteFallback />}>
                  <PodcastsPage />
                </Suspense>
              </RequireSectionAccess>
            </RequireFullMember>
          }
        />
        <Route
          path="resources/*"
          element={
            <RequireFullMember>
              <Suspense fallback={<RouteFallback />}>
                <ResourcesRoutes />
              </Suspense>
            </RequireFullMember>
          }
        />
        <Route
          path="service-flow"
          element={
            <RequireFullMember>
              <Suspense fallback={<RouteFallback />}>
                <ServiceFlowPage />
              </Suspense>
            </RequireFullMember>
          }
        />
        <Route
          path="service-planner"
          element={
            <RequireFullMember>
              <RequireSectionAccess sectionId="service_planner">
                <Suspense fallback={<RouteFallback />}>
                  <ServicePlannerPage />
                </Suspense>
              </RequireSectionAccess>
            </RequireFullMember>
          }
        />
        <Route
          path="songbook"
          element={
            <RequireFullMember>
              <RequireSectionAccess sectionId="songbook">
                <Suspense fallback={<RouteFallback />}>
                  <SongbookLayout />
                </Suspense>
              </RequireSectionAccess>
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
                <ModuleErrorBoundary moduleName="добавление песни">
                  <Suspense fallback={<RouteFallback />}>
                    <AddSongPage />
                  </Suspense>
                </ModuleErrorBoundary>
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
          path="settings"
          element={
            <RequireFullMember>
              <Suspense fallback={<RouteFallback />}>
                <SettingsPage />
              </Suspense>
            </RequireFullMember>
          }
        />
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
        <Route
          path="analytics"
          element={
            <RequireAdmin>
              <Suspense fallback={<RouteFallback />}>
                <AnalyticsPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="admin/analytics"
          element={<Navigate to="/analytics" replace />}
        />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
