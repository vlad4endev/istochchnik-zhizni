import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { MessengerRoutes } from '@features/messenger/routes/MessengerRoutes';
import { MessengerWsProvider } from '@features/messenger/MessengerWsContext';
import { useAuthStore } from '@features/auth/authStore';
import { RequireAuth, RequireMessengerAccess } from '@/app/routeGuards';

import '@/index.css';

function SessionBootstrap() {
  useEffect(() => {
    const run = () => void useAuthStore.getState().bootstrapSessionFromHttpCookie();
    if (useAuthStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useAuthStore.persist.onFinishHydration(run);
  }, []);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
      staleTime: 30_000,
    },
  },
});

function MessengerAppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RequireAuth />}>
        <Route index element={<Navigate to="/messenger" replace />} />
        <Route
          path="messenger/*"
          element={
            <RequireMessengerAccess>
              <MessengerWsProvider>
                <MessengerRoutes />
              </MessengerWsProvider>
            </RequireMessengerAccess>
          }
        />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap />
        <MessengerAppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
