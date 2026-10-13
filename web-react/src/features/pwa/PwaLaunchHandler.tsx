import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type LaunchParamsLike = {
  targetURL?: string;
};

type LaunchQueueLike = {
  setConsumer: (callback: (params: LaunchParamsLike) => void) => void;
};

/**
 * Handles OS/browser launches into the installed PWA (Launch Handler API).
 * When a call/conference invite link opens the app, navigate React Router to that path
 * even if an existing PWA window was merely focused.
 */
export function PwaLaunchHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const launchQueue = (window as Window & { launchQueue?: LaunchQueueLike }).launchQueue;
    if (!launchQueue || typeof launchQueue.setConsumer !== 'function') return;

    launchQueue.setConsumer((params) => {
      const raw = typeof params?.targetURL === 'string' ? params.targetURL.trim() : '';
      if (!raw) return;

      let nextPath: string;
      try {
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin) return;
        nextPath = `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return;
      }

      if (!nextPath.startsWith('/')) return;

      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === current) return;

      navigate(nextPath);
    });
  }, [navigate]);

  return null;
}
