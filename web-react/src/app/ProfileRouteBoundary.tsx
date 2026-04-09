import { Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { ModuleErrorBoundary } from './ModuleErrorBoundary';

/**
 * ErrorBoundary + сброс при смене маршрута (например другой `:username`).
 */
export function ProfileRouteBoundary({
  children,
  moduleName,
  fallback,
}: {
  children: ReactNode;
  moduleName: string;
  fallback: ReactNode;
}) {
  const { pathname } = useLocation();
  return (
    <ModuleErrorBoundary moduleName={moduleName} resetKey={pathname}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModuleErrorBoundary>
  );
}
