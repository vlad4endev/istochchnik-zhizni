import { type ReactNode } from 'react';
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

import { AdminPage } from '../features/admin/pages/AdminPage';
import { DailyPrayerPage } from '../features/calendar/pages/DailyPrayerPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';
import { BroadcastPage } from '../features/broadcast/pages/BroadcastPage';
import { MessengerRoutes } from '../features/messenger/routes/MessengerRoutes';

import { Layout } from './Layout';

const LOGIN_PATH = '/login';

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
        <Route index element={<Navigate to="/prayer" replace />} />
        <Route path="prayer" element={<DailyPrayerPage />} />
        <Route path="messenger/*" element={<MessengerRoutes />} />
        <Route path="broadcast" element={<BroadcastPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/prayer" replace />} />
      </Route>
    </Routes>
  );
}
