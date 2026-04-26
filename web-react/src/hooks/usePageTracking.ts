import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { trackPageView } from '../api/analyticsApi';

function resolvePageKey(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/prayer')) return 'prayer';
  if (pathname.startsWith('/messenger')) return 'messenger';
  if (pathname.startsWith('/songbook')) return 'songbook';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname.startsWith('/service-planner') || pathname.startsWith('/service-plan')) return 'service_planner';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/sermons')) return 'sermons';
  if (pathname.startsWith('/resources')) return 'resources';
  return 'other';
}

export function usePageTracking(): void {
  const location = useLocation();
  const startRef = useRef<number>(Date.now());
  const prevPathRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const currentUrl = useMemo(
    () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    const sendCurrent = (durationOverride?: number) => {
      const duration = durationOverride ?? Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
      void trackPageView({
        page_key: resolvePageKey(window.location.pathname),
        page_url: `${window.location.origin}${currentUrl}`,
        referrer: document.referrer || null,
        duration_seconds: duration,
      });
    };
    const sendWithBeacon = () => {
      const pageKey = resolvePageKey(window.location.pathname);
      const durationMs = Math.max(0, Date.now() - startRef.current);
      const payload = JSON.stringify({
        page_key: pageKey,
        page_url: `${window.location.origin}${currentUrl}`,
        referrer: document.referrer || null,
        duration_ms: durationMs,
      });
      const blob = new Blob([payload], { type: 'application/json' });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/analytics/track/page-view', blob);
      }
    };

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (prevPathRef.current && prevPathRef.current !== currentUrl) {
      sendCurrent();
    }

    debounceTimerRef.current = window.setTimeout(() => {
      startRef.current = Date.now();
      prevPathRef.current = currentUrl;
      sendCurrent(0);
    }, 500);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sendWithBeacon();
      }
    };
    const onBeforeUnload = () => {
      // Fallback for desktop browsers where beforeunload still fires reliably.
      sendCurrent();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [currentUrl]);
}
