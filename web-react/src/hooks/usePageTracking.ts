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
  const flushedRef = useRef<boolean>(false);

  const currentUrl = useMemo(
    () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    const sendCurrent = (path: string) => {
      const duration = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
      void trackPageView({
        page_key: resolvePageKey(path.split('?')[0].split('#')[0] || '/'),
        page_url: `${window.location.origin}${path}`,
        referrer: document.referrer || null,
        duration_seconds: duration,
      });
    };
    const sendWithBeacon = (path: string) => {
      const durationMs = Math.max(0, Date.now() - startRef.current);
      const payload = JSON.stringify({
        page_key: resolvePageKey(path.split('?')[0].split('#')[0] || '/'),
        page_url: `${window.location.origin}${path}`,
        referrer: document.referrer || null,
        duration_ms: durationMs,
      });
      const blob = new Blob([payload], { type: 'application/json' });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/analytics/track/page-view', blob);
      } else {
        sendCurrent(path);
      }
    };

    const previousPath = prevPathRef.current;
    if (previousPath && previousPath !== currentUrl && !flushedRef.current) {
      sendCurrent(previousPath);
    }

    startRef.current = Date.now();
    prevPathRef.current = currentUrl;
    flushedRef.current = false;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !flushedRef.current && prevPathRef.current) {
        sendWithBeacon(prevPathRef.current);
        flushedRef.current = true;
      }
    };
    const flushOnLeave = () => {
      if (!flushedRef.current && prevPathRef.current) {
        sendWithBeacon(prevPathRef.current);
        flushedRef.current = true;
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushOnLeave);
    window.addEventListener('beforeunload', flushOnLeave);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushOnLeave);
      window.removeEventListener('beforeunload', flushOnLeave);
    };
  }, [currentUrl]);
}
