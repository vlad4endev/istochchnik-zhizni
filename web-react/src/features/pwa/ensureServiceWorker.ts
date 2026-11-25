import { isCapacitorNative } from '../../lib/nativeApp';

/**
 * Регистрация SW делает `useRegisterSW` один раз при загрузке. Если именно в этот момент `/sw.js`
 * отдал 5xx (идёт передеплой), регистрации нет, `navigator.serviceWorker.ready` не наступит никогда,
 * и push не подписывается до ручной перезагрузки. Здесь — повторные попытки с нарастающей паузой.
 *
 * Внутри нативного APK Service Worker не нужен: весь сайт уже вшит в приложение (dist в assets),
 * precache дублировал бы ~10 МБ в хранилище WebView и добавлял слой устаревания. Пуши в нативе
 * идут через FCM, а не Web Push.
 */
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000];

function swUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}sw.js`;
}

export async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (isCapacitorNative()) return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    return await navigator.serviceWorker.register(swUrl(), { scope: base });
  } catch {
    return null;
  }
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0;

/** Повторяет регистрацию, пока не получится (или пока не исчерпан список пауз). */
export function scheduleServiceWorkerRegistrationRetry(): void {
  if (isCapacitorNative()) return;
  if (retryTimer || retryAttempt >= RETRY_DELAYS_MS.length) return;
  const delay = RETRY_DELAYS_MS[retryAttempt]!;
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void ensureServiceWorkerRegistered().then((reg) => {
      if (reg) {
        retryAttempt = 0;
        return;
      }
      scheduleServiceWorkerRegistrationRetry();
    });
  }, delay);
}

/**
 * Однократная зачистка SW, оставшегося в хранилище WebView от прежних сборок APK:
 * без этого старый SW продолжал бы жить, обновляться и дублировать ~10 МБ precache.
 */
export async function purgeServiceWorkerInNativeApp(): Promise<void> {
  if (!isCapacitorNative()) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
    }
    if (regs.length > 0) {
      console.info('[sw] removed stale service worker inside native app:', regs.length);
    }
  } catch {
    /* ignore */
  }
}
