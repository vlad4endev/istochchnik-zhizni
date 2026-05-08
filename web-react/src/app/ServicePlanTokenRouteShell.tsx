import { Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { ModuleErrorBoundary } from './ModuleErrorBoundary';
import { RouteFallback } from './routeGuards';

type Props = {
  children: ReactNode;
  /** Текст в сообщении пользователю при сбое рендера */
  moduleName: string;
};

/**
 * Оборачивает публичные маршруты программы собрания (share / edit по токену):
 * Error Boundary + Suspense и сброс ошибки при смене pathname (другая ссылка).
 */
export function ServicePlanTokenRouteShell({ moduleName, children }: Props) {
  const { pathname } = useLocation();
  return (
    <ModuleErrorBoundary moduleName={moduleName} resetKey={pathname}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ModuleErrorBoundary>
  );
}
