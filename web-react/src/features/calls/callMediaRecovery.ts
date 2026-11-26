/**
 * Чистые хелперы устойчивости веб-звонков:
 * - восстановление аудио без бесконечного цикла AudioPlaybackStatusChanged;
 * - классификация ошибок устройств (не должны ломать connectError комнаты);
 * - расписание экспоненциального перезахода.
 */

export const MAX_REJOIN_ATTEMPTS = 4;

/** Задержка перед попыткой перезахода (1-based): 0.8s → 2s → 4s → 8s (макс. 10s). */
export function computeRejoinDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  if (n === 1) return 800;
  return Math.min(2000 * 2 ** (n - 2), 10_000);
}

const MEDIA_DEVICE_ERROR_NAMES = new Set([
  'NotAllowedError',
  'PermissionDeniedError',
  'NotFoundError',
  'DevicesNotFoundError',
  'NotReadableError',
  'TrackStartError',
  'OverconstrainedError',
  'ConstraintNotSatisfiedError',
  'SecurityError',
  'MediaDeviceFailure',
]);

/**
 * Ошибки доступа к микрофону/камере не означают разрыв соединения с комнатой LiveKit
 * и не должны переводить экран звонка в состояние connectError.
 */
export function isMediaDeviceError(err: unknown): boolean {
  if (!err) return false;
  const name =
    typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name ?? '') : '';
  if (MEDIA_DEVICE_ERROR_NAMES.has(name)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /NotAllowedError|PermissionDeniedError|NotFoundError|NotReadableError|OverconstrainedError|TrackStartError|MediaDeviceFailure/i.test(
      msg,
    )
  ) {
    return true;
  }
  if (
    /permission denied|requested device not found|could not start (?:audio|video) source|device in use/i.test(
      msg,
    )
  ) {
    return true;
  }
  return false;
}

export type CallAudioRecoveryHost = {
  isConnected: () => boolean;
  canPlaybackAudio: () => boolean;
  startAudio: () => Promise<void>;
  isHidden?: () => boolean;
  hasPausedAudioElements?: () => boolean;
  resumePausedAudioElements?: () => boolean;
  onUserGestureUnlock?: () => void;
  now?: () => number;
  gestureThrottleMs?: number;
};

export type CallAudioRecoveryController = {
  onRoomActive: () => void;
  onPlaybackChanged: () => void;
  onForeground: () => void;
  onGesture: () => void;
  onWatchdogTick: () => void;
  isBlockedByPolicy: () => boolean;
  dispose: () => void;
};

/**
 * Контроллер восстановления аудио для LiveKit Room:
 * 1. НЕ вызывает startAudio() из AudioPlaybackStatusChanged(false) — разрывает
 *    бесконечный 200ms цикл acquireAudioContext() ↔ handleAudioPlaybackStarted()
 *    в livekit-client при заблокированном autoplay.
 * 2. Вызывает startAudio() на пользовательский жест только когда звук реально
 *    заблокирован или элементы <audio> стоят на паузе, с троттлингом (dedupe pointerdown+click).
 * 3. Watchdog не долбит startAudio() при блокировке autoplay, но тихо будит
 *    поставленные iOS/Safari на паузу <audio> элементы, когда playback разрешён.
 */
export function createCallAudioRecovery(
  host: CallAudioRecoveryHost,
): CallAudioRecoveryController {
  const now = host.now ?? (() => Date.now());
  const gestureThrottleMs = host.gestureThrottleMs ?? 250;

  let disposed = false;
  let inFlight = false;
  let blockedByPolicy = false;
  let sawBlockedDuringAttempt = false;
  let lastGestureAttemptAt = Number.NEGATIVE_INFINITY;

  const isHidden = () => Boolean(host.isHidden?.());

  const attemptStart = (source: 'auto' | 'gesture') => {
    if (disposed || inFlight || isHidden()) return;
    if (!host.isConnected()) return;
    if (source === 'auto' && blockedByPolicy) return;

    if (source === 'gesture') {
      const needsRecovery =
        !host.canPlaybackAudio() ||
        blockedByPolicy ||
        Boolean(host.hasPausedAudioElements?.());
      if (!needsRecovery) return;

      const t = now();
      if (t - lastGestureAttemptAt < gestureThrottleMs) return;
      lastGestureAttemptAt = t;
      blockedByPolicy = false;
      host.onUserGestureUnlock?.();
    }

    inFlight = true;
    sawBlockedDuringAttempt = false;

    let startPromise: Promise<void>;
    try {
      startPromise = Promise.resolve(host.startAudio());
    } catch {
      sawBlockedDuringAttempt = true;
      blockedByPolicy = true;
      inFlight = false;
      return;
    }

    void startPromise
      .catch(() => {
        if (!disposed) {
          sawBlockedDuringAttempt = true;
          blockedByPolicy = true;
        }
      })
      .finally(() => {
        const wasBlocked = sawBlockedDuringAttempt;
        sawBlockedDuringAttempt = false;
        inFlight = false;
        if (disposed) return;
        if (wasBlocked || !host.canPlaybackAudio()) {
          blockedByPolicy = true;
        } else {
          blockedByPolicy = false;
          host.resumePausedAudioElements?.();
        }
      });
  };

  return {
    onRoomActive() {
      if (disposed || isHidden() || !host.isConnected()) return;
      if (!host.canPlaybackAudio()) {
        attemptStart('auto');
      } else {
        host.resumePausedAudioElements?.();
      }
    },

    onPlaybackChanged() {
      if (disposed) return;
      if (!host.canPlaybackAudio()) {
        blockedByPolicy = true;
        if (inFlight) sawBlockedDuringAttempt = true;
        return;
      }
      // В livekit-client при пустом списке audio-элементов startAudio() может кратковременно
      // эмитить AudioPlaybackStatusChanged(true) сразу после (false) в рамках той же попытки.
      if (!inFlight) {
        blockedByPolicy = false;
      }
    },

    onForeground() {
      if (disposed || isHidden() || !host.isConnected()) return;
      if (!host.canPlaybackAudio()) {
        attemptStart('auto');
      } else {
        host.resumePausedAudioElements?.();
      }
    },

    onGesture() {
      attemptStart('gesture');
    },

    onWatchdogTick() {
      if (disposed || isHidden() || !host.isConnected()) return;
      if (blockedByPolicy || !host.canPlaybackAudio()) return;
      host.resumePausedAudioElements?.();
    },

    isBlockedByPolicy() {
      return blockedByPolicy;
    },

    dispose() {
      disposed = true;
    },
  };
}
