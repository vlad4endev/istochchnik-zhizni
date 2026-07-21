import { useEffect, useRef } from 'react';
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
  if (pathname.startsWith('/my-sermons')) return 'my_sermons';
  if (pathname.startsWith('/resources')) return 'resources';
  return 'other';
}

type PageSnapshot = { pathname: string; fullUrl: string };

/**
 * Трекинг SPA: один «переход» = смена `pathname` (не query/hash).
 * Иначе каждый ?tab= в студии и др. даёт POST и упирается в rate limit (429).
 */
export function usePageTracking(): void {
  const location = useLocation();
  const startRef = useRef<number>(Date.now());
  const snapshotRef = useRef<PageSnapshot | null>(null);
  const flushedRef = useRef<boolean>(false);

  /** Только обновление полного URL при смене query/hash на том же маршруте. */
  useEffect(() => {
    const fullUrl = `${location.pathname}${location.search}${location.hash}`;
    const prev = snapshotRef.current;
    if (prev && prev.pathname === location.pathname) {
      snapshotRef.current = { pathname: location.pathname, fullUrl };
    }
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const pathname = location.pathname;
    const fullUrl = `${location.pathname}${location.search}${location.hash}`;

    const sendCurrent = (pathForKey: string, pageUrl: string) => {
      const duration = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
      void trackPageView({
        page_key: resolvePageKey(pathForKey.split('?')[0].split('#')[0] || '/'),
        page_url: pageUrl,
        referrer: document.referrer || null,
        duration_seconds: duration,
      });
    };

    const sendWithBeacon = (pathForKey: string, pageUrlFull: string) => {
      const durationMs = Math.max(0, Date.now() - startRef.current);
      const payload = JSON.stringify({
        page_key: resolvePageKey(pathForKey.split('?')[0].split('#')[0] || '/'),
        page_url: pageUrlFull,
        referrer: document.referrer || null,
        duration_ms: durationMs,
      });
      const blob = new Blob([payload], { type: 'application/json' });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/analytics/track/page-view', blob);
      } else {
        sendCurrent(pathForKey, pageUrlFull);
      }
    };

    const snap = snapshotRef.current;

    if (snap && snap.pathname !== pathname && !flushedRef.current) {
      sendCurrent(snap.pathname, `${window.location.origin}${snap.fullUrl}`);
    }

    snapshotRef.current = { pathname, fullUrl };
    startRef.current = Date.now();
    flushedRef.current = false;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !flushedRef.current && snapshotRef.current) {
        const s = snapshotRef.current;
        sendWithBeacon(s.pathname, `${window.location.origin}${s.fullUrl}`);
        flushedRef.current = true;
      }
    };
    const flushOnLeave = () => {
      if (!flushedRef.current && snapshotRef.current) {
        const s = snapshotRef.current;
        sendWithBeacon(s.pathname, `${window.location.origin}${s.fullUrl}`);
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
  }, [location.pathname]);
}
