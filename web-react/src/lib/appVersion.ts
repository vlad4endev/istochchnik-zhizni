import { isCapacitorNative } from './nativeApp';

/**
 * Как «узнаёт свою версию» каждый запуск:
 * - нативный APK — из константы __APP_VERSION_CODE__, вшитой при сборке из build.gradle;
 * - PWA/браузер и старые APK без константы — из localStorage-маркера, который пишется,
 *   когда пользователь жмёт «Обновить» (то есть скачал очередную сборку).
 */

const INSTALLED_CODE_KEY = 'app-release-installed-code';
const BANNER_DISMISS_KEY = 'app-update-banner-dismissed-id';
const BANNER_CHANGE_EVENT = 'app-update-banner-visibility-changed';

/** Вшитая версия имеет смысл только внутри нативного APK. */
export function getEmbeddedAppVersionCode(): number | null {
  if (typeof __APP_VERSION_CODE__ !== 'number' || !(__APP_VERSION_CODE__ > 0)) return null;
  if (!isCapacitorNative()) return null;
  return __APP_VERSION_CODE__;
}

/** Вшитое имя версии — для заголовка баннера в нативном APK. */
export function getEmbeddedAppVersionName(): string {
  if (typeof __APP_VERSION_NAME__ !== 'string') return '';
  return __APP_VERSION_NAME__.trim();
}

/** Предполагаемая версия установленного приложения; null — «не знаем». */
export function readInstalledVersionCode(): number | null {
  const embedded = getEmbeddedAppVersionCode();
  if (embedded != null) return embedded;
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(INSTALLED_CODE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  } catch {
    return null;
  }
}

/** Пользователь нажал «Обновить» — считаем сборку скачанной (и после установки — актуальной). */
export function markReleaseDownloaded(versionCode: number | null | undefined): void {
  if (versionCode == null || !Number.isFinite(versionCode) || versionCode <= 0) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(INSTALLED_CODE_KEY, String(Math.trunc(versionCode)));
    }
  } catch {
    /* ignore */
  }
}

/** Есть ли более новая сборка, чем установленная. */
export function hasNewerRelease(
  latestCode: number | null | undefined,
  installedCode: number | null,
): boolean {
  if (latestCode == null || installedCode == null) return false;
  return latestCode > installedCode;
}

/** «Позже» в баннере — до следующего релиза баннер не появляется. */
export function isBannerDismissedForRelease(releaseId: number | null | undefined): boolean {
  if (releaseId == null || !Number.isFinite(releaseId)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    return Number(localStorage.getItem(BANNER_DISMISS_KEY)) === releaseId;
  } catch {
    return false;
  }
}

export function dismissBannerForRelease(releaseId: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BANNER_DISMISS_KEY, String(releaseId));
    }
  } catch {
    /* ignore */
  }
}

/** Виджет на главной и баннер обновления живут независимо — синхронизируемся событием. */
export function notifyUpdateBannerVisibilityChanged(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(BANNER_CHANGE_EVENT));
    }
  } catch {
    /* ignore */
  }
}

export function onUpdateBannerVisibilityChanged(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  window.addEventListener(BANNER_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener(BANNER_CHANGE_EVENT, callback);
  };
}
