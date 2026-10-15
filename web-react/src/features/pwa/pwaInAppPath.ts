/**
 * Paths that must stay inside the SPA / installed PWA (never open a new Safari tab on iOS).
 * Meeting invites often arrive with PUBLIC_WEB_ORIGIN that differs from the install origin
 * (www vs app.*, API host, env mismatch) — treat by pathname, not only same-origin.
 */
export function isInAppDeepLinkPath(pathname: string): boolean {
  const path = String(pathname || '').trim();
  if (!path.startsWith('/')) return false;
  if (path.startsWith('/call/join/')) return true;
  // /call/:callId — not /callback, /calls, …
  return /^\/call\/[^/]+\/?$/.test(path);
}

/**
 * Convert an absolute or relative URL into an in-app router path when safe.
 * For `/call/join/...` always returns the path even if the host differs from `window.location`.
 */
export function appPathFromHref(url: string, baseHref?: string): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    try {
      const parsed = new URL(raw, 'https://local.invalid');
      if (isInAppDeepLinkPath(parsed.pathname)) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const base =
      baseHref ||
      (typeof window !== 'undefined' ? window.location.href : 'https://local.invalid/');
    const parsed = new URL(raw, base);
    const next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (isInAppDeepLinkPath(parsed.pathname)) return next;

    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      if (parsed.pathname.startsWith('/')) return next;
    }
  } catch {
    return null;
  }
  return null;
}

/** Prefer current page origin for shared meeting links (matches installed PWA scope). */
export function absoluteAppUrlForShare(urlOrPath: string): string {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined') return raw;
  const appPath = appPathFromHref(raw);
  if (appPath) {
    try {
      return new URL(appPath, window.location.origin).toString();
    } catch {
      return `${window.location.origin}${appPath}`;
    }
  }
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return raw;
  }
}
