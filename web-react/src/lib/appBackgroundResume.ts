/**
 * Единая точка «приложение снова активно / сеть вернулась».
 * iOS PWA часто не шлёт `online`, но шлёт visibility/pageshow — outbox и refresh сессии
 * должны реагировать на все эти сигналы, а не только на `window.online`.
 */
export type AppBackgroundResumeReason =
  | 'online'
  | 'visibility'
  | 'pageshow'
  | 'focus'
  | 'connection-change';

type ResumeListener = (reason: AppBackgroundResumeReason) => void;

const RESUME_DEBOUNCE_MS = 500;
/** Не чаще одного «resume» за короткий интервал (visibility + focus + pageshow подряд). */
const MIN_RESUME_GAP_MS = 1_200;

let bound = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let lastEmitAt = 0;
const listeners = new Set<ResumeListener>();

function canResumeNow(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function emit(reason: AppBackgroundResumeReason): void {
  const now = Date.now();
  const gap = now - lastEmitAt;

  const fire = (): void => {
    lastEmitAt = Date.now();
    for (const cb of listeners) {
      try {
        cb(reason);
      } catch {
        /* listener must not break others */
      }
    }
  };

  if (gap >= MIN_RESUME_GAP_MS) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    debounceTimer = setTimeout(fire, RESUME_DEBOUNCE_MS);
    return;
  }

  if (trailingTimer) clearTimeout(trailingTimer);
  trailingTimer = setTimeout(fire, MIN_RESUME_GAP_MS - gap);
}

function scheduleResume(reason: AppBackgroundResumeReason): void {
  if (!canResumeNow()) return;
  emit(reason);
}

function ensureBound(): void {
  if (bound || typeof window === 'undefined') return;
  bound = true;

  window.addEventListener('online', () => scheduleResume('online'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    scheduleResume('visibility');
  });

  window.addEventListener('pageshow', () => scheduleResume('pageshow'));

  window.addEventListener('focus', () => {
    if (document.visibilityState === 'hidden') return;
    scheduleResume('focus');
  });

  const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', () => scheduleResume('connection-change'));
  }
}

/** Подписка на возврат приложения в активное состояние или восстановление сети. */
export function onAppBackgroundResume(listener: ResumeListener): () => void {
  listeners.add(listener);
  ensureBound();
  return () => {
    listeners.delete(listener);
  };
}

/** Только для тестов / ручной отладки. */
export function notifyAppBackgroundResume(reason: AppBackgroundResumeReason = 'visibility'): void {
  scheduleResume(reason);
}
