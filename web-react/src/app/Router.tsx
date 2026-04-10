import { lazy, Suspense, type ReactNode } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { AuthLandingPage } from '../features/auth/pages/AuthLandingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { useAuthStore } from '../features/auth/authStore';
import { useAuthHydrated } from '../hooks/useAuthHydrated';

import { DailyPrayerPage } from '../features/calendar/pages/DailyPrayerPage';
import { BroadcastPage } from '../features/broadcast/pages/BroadcastPage';
import { ResourcesRoutes } from '../features/resources/routes/ResourcesRoutes';
import { PodcastsPage } from '../features/resources/pages/PodcastsPage';
import { ServiceFlowPage } from '../features/serviceFlow/pages/ServiceFlowPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';

import { canAccessStudioRole } from '../features/auth/studioAccess';

import { Layout } from './Layout';
import { ProfileRouteBoundary } from './ProfileRouteBoundary';

/** Отдельные чанки: настройки (`/profile`) и публичная лента (`/profile/:username`) не тянут друг друга. */
const LazyProfilePage = lazy(async () => {
  const m = await import('@features/profile/pages/ProfilePage');
  return { default: m.ProfilePage };
});

const LazyPublicProfilePage = lazy(async () => {
  const m = await import('@features/profile/pages/PublicProfilePage');
  return { default: m.PublicProfilePage };
});

const MessengerRoutes = lazy(async () => {
  const m = await import('../features/messenger/routes/MessengerRoutes');
  return { default: m.MessengerRoutes };
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

const StudioDraftsPage = lazy(async () => {
  const m = await import('../features/studio/pages/DraftsPage');
  return { default: m.DraftsPage };
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

const PublicSetlistPage = lazy(async () => {
  const m = await import('../features/studio/pages/PublicSetlistPage');
  return { default: m.PublicSetlistPage };
});

const LOGIN_PATH = '/login';

function RouteFallback(): ReactNode {
  return (
    <div className="flex min-h-[50dvh] w-full flex-1 items-center justify-center bg-[var(--surface)] text-stone-500">
      <p className="text-sm font-medium">Загрузка…</p>
    </div>
  );
}

function HydrateSplash(): ReactNode {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] text-stone-500">
      <p className="text-sm font-medium">Загрузка…</p>
    </div>
  );
}

function RequireAuth() {
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!hydrated) {
    return <HydrateSplash />;
  }

  if (!token) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  if (!isAdmin) {
    return <Navigate to="/prayer" replace />;
  }
  return <>{children}</>;
}

/** Полный доступ к разделам приложения только после одобрения заявки (active). */
function RequireFullMember({ children }: { children: ReactNode }) {
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  if (registrationStatus !== 'active') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

/** Чаты недоступны, пока заявка на регистрацию не одобрена (отклонённым — для поддержки). */
function RequireMessengerAccess({ children }: { children: ReactNode }) {
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  if (registrationStatus === 'pending_review') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function RequireStudioAccess({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  if (!canAccessStudioRole(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

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
          <Route
            path="drafts"
            element={
              <Suspense fallback={<RouteFallback />}>
                <StudioDraftsPage />
              </Suspense>
            }
          />
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
            <RequireMessengerAccess>
              <Suspense fallback={<RouteFallback />}>
                <MessengerRoutes />
              </Suspense>
            </RequireMessengerAccess>
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
              <Suspense fallback={<RouteFallback />}>
                <SongbookPage />
              </Suspense>
            </RequireFullMember>
          }
        />
        <Route
          path="songbook/:id"
          element={
            <RequireFullMember>
              <Suspense fallback={<RouteFallback />}>
                <SongDetailPage />
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
