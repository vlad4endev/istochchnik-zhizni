/** Browser / Capacitor online check shared by songbook & feed fallbacks. */
export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
