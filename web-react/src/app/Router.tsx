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

import { DailyPrayerPage } from '../features/calendar/pages/DailyPrayerPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';

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

function AdminPlaceholder() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-extrabold text-stone-900">Админка</h1>
      <p className="mt-2 text-stone-600">Заглушка панели администратора.</p>
    </div>
  );
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
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPlaceholder />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/prayer" replace />} />
      </Route>
    </Routes>
  );
}
