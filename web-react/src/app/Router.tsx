import { lazy, Suspense, type ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { AuthLandingPage } from '../features/auth/pages/AuthLandingPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { useAuthStore } from '../features/auth/authStore';
import { useAuthHydrated } from '../hooks/useAuthHydrated';

import { DailyPrayerPage } from '../features/calendar/pages/DailyPrayerPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';
import { BroadcastPage } from '../features/broadcast/pages/BroadcastPage';
import { ResourcesRoutes } from '../features/resources/routes/ResourcesRoutes';
import { PodcastsPage } from '../features/resources/pages/PodcastsPage';
import { ServiceFlowPage } from '../features/serviceFlow/pages/ServiceFlowPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';

import { Layout } from './Layout';

const MessengerRoutes = lazy(async () => {
  const m = await import('../features/messenger/routes/MessengerRoutes');
  return { default: m.MessengerRoutes };
});

const AdminPage = lazy(async () => {
  const m = await import('../features/admin/pages/AdminPage');
  return { default: m.AdminPage };
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

function RequireAuth({ children }: { children: ReactNode }) {
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!hydrated) {
    return <HydrateSplash />;
  }

  if (!token) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
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

export function AppRouter() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<AuthLandingPage />} />
      <Route path={`${LOGIN_PATH}/form`} element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
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
              <MessengerRoutes />
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
          path="profile"
          element={
            <RequireFullMember>
              <ProfilePage />
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
    </Routes>
  );
}
