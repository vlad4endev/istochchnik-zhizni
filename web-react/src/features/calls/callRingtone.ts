/**
 * Рингтон / гудки через Web Audio API.
 * Не зависит от /public/sounds/*.mp3 (на проде файла не было).
 *
 * На Capacitor для входящего дополнительно играет нативный RingtoneManager /
 * AVAudioEngine — Web Audio часто остаётся silent без жеста пользователя.
 */

import { isCapacitorNative } from '../../lib/nativeApp';
import { NativeCall } from '../../plugins/nativeCall';

type RingKind = 'ringtone' | 'ringback';

let sharedCtx: AudioContext | null = null;
let activeStop: (() => void) | null = null;
let unlocked = false;
let nativeRingtoneActive = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

/** Разблокировать AudioContext после жеста пользователя (клик / tap). */
export function unlockCallAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  unlocked = true;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

function stopNativeRingtone(): void {
  if (!nativeRingtoneActive) return;
  nativeRingtoneActive = false;
  if (!isCapacitorNative()) return;
  void NativeCall.stopRingtone().catch(() => undefined);
}

function startNativeRingtone(): void {
  if (!isCapacitorNative()) return;
  nativeRingtoneActive = true;
  void NativeCall.playRingtone().catch(() => {
    nativeRingtoneActive = false;
  });
}

function stopActive(): void {
  if (activeStop) {
    try {
      activeStop();
    } catch {
      /* ignore */
    }
    activeStop = null;
  }
  stopNativeRingtone();
}

/**
 * Классический «телефонный» паттерн:
 * ringtone — два тона ~0.4s, пауза ~0.2s, повтор
 * ringback — тон 425Hz 1s / тишина 3s (похож на гудки)
 */
export function startCallRing(kind: RingKind = 'ringtone'): () => void {
  stopActive();
  const ctx = getCtx();
  if (!ctx) return () => undefined;

  void ctx.resume().catch(() => undefined);

  const master = ctx.createGain();
  master.gain.value = kind === 'ringtone' ? 0.18 : 0.12;
  master.connect(ctx.destination);

  let cancelled = false;
  let timer: number | null = null;
  const oscillators: OscillatorNode[] = [];

  const clearOsc = () => {
    for (const o of oscillators.splice(0)) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* already stopped */
      }
    }
  };

  const scheduleRingtoneBurst = () => {
    if (cancelled) return;
    const now = ctx.currentTime;
    const freqs = [440, 480];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
      g.gain.setValueAtTime(0.5, now + 0.38);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.45);
      oscillators.push(osc);
    }
    // второй «звонок» через 0.5s
    window.setTimeout(() => {
      if (cancelled) return;
      const t2 = ctx.currentTime;
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t2);
        g.gain.exponentialRampToValueAtTime(0.5, t2 + 0.02);
        g.gain.setValueAtTime(0.5, t2 + 0.38);
        g.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.42);
        osc.connect(g);
        g.connect(master);
        osc.start(t2);
        osc.stop(t2 + 0.45);
        oscillators.push(osc);
      }
    }, 500);
    timer = window.setTimeout(scheduleRingtoneBurst, 2000);
  };

  const scheduleRingback = () => {
    if (cancelled) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 425;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.03);
    g.gain.setValueAtTime(0.7, now + 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 1.1);
    oscillators.push(osc);
    timer = window.setTimeout(scheduleRingback, 4000);
  };

  if (kind === 'ringtone') {
    // Натив обходит autoplay; Web Audio — запасной канал / браузер
    startNativeRingtone();
    scheduleRingtoneBurst();
  } else {
    scheduleRingback();
  }

  // Вибрация только для входящего
  let vibeTimer: number | null = null;
  if (kind === 'ringtone' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    const vibe = () => {
      if (cancelled) return;
      try {
        navigator.vibrate([300, 120, 300, 120, 600]);
      } catch {
        /* ignore */
      }
      vibeTimer = window.setTimeout(vibe, 2000);
    };
    vibe();
  }

  const stop = () => {
    cancelled = true;
    if (timer != null) window.clearTimeout(timer);
    if (vibeTimer != null) window.clearTimeout(vibeTimer);
    clearOsc();
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0);
      }
    } catch {
      /* ignore */
    }
    if (activeStop === stop) activeStop = null;
  };

  activeStop = stop;
  void unlocked;
  return stop;
}

export function stopCallRing(): void {
  stopActive();
}
