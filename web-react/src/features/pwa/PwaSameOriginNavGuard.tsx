import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { isInstalledPwa, isAppleMobileWeb } from './utils/pwaEnvironment';
import { appPathFromHref } from './pwaInAppPath';

/**
 * On iOS home-screen PWA, a full document navigation (or target=_blank) to https://…
 * often leaves standalone and opens Safari — even for URLs inside the app scope.
 * Capture same-app deep links and route them through React Router instead.
 */
export function PwaSameOriginNavGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Focus on Apple standalone; harmless elsewhere but keep the guard tight.
    if (!isAppleMobileWeb() || !isInstalledPwa()) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor) return;
      if (anchor.hasAttribute('download')) return;

      const hrefAttr = anchor.getAttribute('href');
      if (!hrefAttr || hrefAttr.startsWith('#') || hrefAttr.startsWith('mailto:') || hrefAttr.startsWith('tel:')) {
        return;
      }

      const appPath = appPathFromHref(hrefAttr, window.location.href);
      if (!appPath) return;

      // Allow intentional new-tab only for non-call external cases; call deep links always stay.
      const targetAttr = (anchor.getAttribute('target') || '').toLowerCase();
      if (targetAttr === '_blank' && !appPath.startsWith('/call/')) return;

      event.preventDefault();
      event.stopPropagation();
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (appPath !== current) navigate(appPath);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  return null;
}
