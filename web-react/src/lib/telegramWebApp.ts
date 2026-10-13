/**
 * Telegram Mini App (WebApp) helpers.
 * Script is injected by Telegram when opened inside the client — we only consume it.
 * @see https://core.telegram.org/bots/webapps
 */

type TgInset = { top: number; bottom: number; left: number; right: number };

type TelegramWebAppLike = {
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  isFullscreen?: boolean;
  platform?: string;
  version?: string;
  safeAreaInset?: TgInset;
  contentSafeAreaInset?: TgInset;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebAppLike };
  }
}

const PX = (n: number | undefined): string => `${Math.max(0, Number(n) || 0)}px`;

function webApp(): TelegramWebAppLike | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramWebApp(): boolean {
  const tg = webApp();
  if (!tg) return false;
  // Mini App always has platform/version; plain browsers may stub an empty object.
  return Boolean(tg.platform || tg.version || typeof tg.ready === 'function');
}

function applyInsetCssVars(tg: TelegramWebAppLike): void {
  const root = document.documentElement;
  const safe = tg.safeAreaInset;
  const content = tg.contentSafeAreaInset;
  root.style.setProperty('--tg-safe-area-inset-top', PX(safe?.top));
  root.style.setProperty('--tg-safe-area-inset-bottom', PX(safe?.bottom));
  root.style.setProperty('--tg-safe-area-inset-left', PX(safe?.left));
  root.style.setProperty('--tg-safe-area-inset-right', PX(safe?.right));
  root.style.setProperty('--tg-content-safe-area-inset-top', PX(content?.top));
  root.style.setProperty('--tg-content-safe-area-inset-bottom', PX(content?.bottom));
  root.style.setProperty('--tg-content-safe-area-inset-left', PX(content?.left));
  root.style.setProperty('--tg-content-safe-area-inset-right', PX(content?.right));
}

let callPresentationDepth = 0;
let callFullscreenActive = false;
let insetListenersAttached = false;

function syncCallPresentation(): void {
  const tg = webApp();
  if (!tg || !isTelegramWebApp()) return;

  const active = callPresentationDepth > 0;
  document.documentElement.toggleAttribute('data-telegram-call', active);

  if (active) {
    try {
      tg.setHeaderColor?.('#0e0f14');
      tg.setBackgroundColor?.('#0e0f14');
    } catch {
      /* ignore */
    }
    try {
      tg.expand?.();
    } catch {
      /* ignore */
    }
    if (!callFullscreenActive && typeof tg.requestFullscreen === 'function') {
      try {
        tg.requestFullscreen();
        callFullscreenActive = true;
      } catch {
        callFullscreenActive = false;
      }
    }
  } else if (callFullscreenActive && typeof tg.exitFullscreen === 'function') {
    try {
      tg.exitFullscreen();
    } catch {
      /* ignore */
    }
    callFullscreenActive = false;
  }

  applyInsetCssVars(tg);
}

/**
 * Call once at app boot. No-op outside Telegram.
 */
export function initTelegramWebApp(): void {
  const tg = webApp();
  if (!tg || !isTelegramWebApp()) return;

  document.documentElement.setAttribute('data-telegram-webapp', '1');
  try {
    tg.ready?.();
  } catch {
    /* ignore */
  }
  try {
    tg.expand?.();
  } catch {
    /* ignore */
  }
  try {
    tg.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
  try {
    tg.setHeaderColor?.('#0e0f14');
    tg.setBackgroundColor?.('#0e0f14');
  } catch {
    /* ignore */
  }
  applyInsetCssVars(tg);

  if (!insetListenersAttached && typeof tg.onEvent === 'function') {
    insetListenersAttached = true;
    const sync = () => applyInsetCssVars(tg);
    tg.onEvent('safeAreaChanged', sync);
    tg.onEvent('contentSafeAreaChanged', sync);
    tg.onEvent('fullscreenChanged', sync);
  }
}

/**
 * Acquire/release fullscreen call chrome in Telegram.
 * Ref-counted so IncomingCallOverlay + CallWindow can overlap during accept.
 */
export function setTelegramCallPresentation(active: boolean): void {
  if (!isTelegramWebApp()) return;
  if (active) {
    callPresentationDepth += 1;
  } else {
    callPresentationDepth = Math.max(0, callPresentationDepth - 1);
  }
  syncCallPresentation();
}
