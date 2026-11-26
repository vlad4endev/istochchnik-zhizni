import { describe, expect, it, vi } from 'vitest';

import {
  computeRejoinDelayMs,
  createCallAudioRecovery,
  isMediaDeviceError,
  MAX_REJOIN_ATTEMPTS,
} from '../src/features/calls/callMediaRecovery';

describe('computeRejoinDelayMs', () => {
  it('использует быстрый первый ретрай и экспоненциальный backoff с потолком 10s', () => {
    expect(MAX_REJOIN_ATTEMPTS).toBe(4);
    expect(computeRejoinDelayMs(1)).toBe(800);
    expect(computeRejoinDelayMs(2)).toBe(2000);
    expect(computeRejoinDelayMs(3)).toBe(4000);
    expect(computeRejoinDelayMs(4)).toBe(8000);
    expect(computeRejoinDelayMs(5)).toBe(10_000);
  });
});

describe('isMediaDeviceError', () => {
  it('распознаёт ошибки доступа к камере и микрофону', () => {
    expect(isMediaDeviceError(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))).toBe(true);
    expect(isMediaDeviceError(Object.assign(new Error('Device not found'), { name: 'NotFoundError' }))).toBe(true);
    expect(isMediaDeviceError(Object.assign(new Error('Busy'), { name: 'NotReadableError' }))).toBe(true);
    expect(isMediaDeviceError(new Error('Could not start video source'))).toBe(true);
    expect(isMediaDeviceError(new Error('TrackStartError: audio capture failed'))).toBe(true);
  });

  it('не путает сетевые и сигнальные ошибки комнаты с ошибками устройств', () => {
    expect(
      isMediaDeviceError(
        new Error('could not establish signal connection: room connection has timed out (signal)'),
      ),
    ).toBe(false);
    expect(isMediaDeviceError(new Error('could not establish pc connection'))).toBe(false);
    expect(isMediaDeviceError(new Error('websocket closed'))).toBe(false);
  });
});

describe('createCallAudioRecovery', () => {
  it('не создаёт бесконечный цикл при блокировке autoplay (включая ложный emit true в livekit-client)', async () => {
    let canPlay = false;
    let connected = true;
    const startAudio = vi.fn(async () => {
      // Имитация livekit-client: acquireAudioContext() эмитит false,
      // а затем при пустом списке элементов handleAudioPlaybackStarted() кратковременно ставит true.
      canPlay = false;
      ctrl.onPlaybackChanged();
      canPlay = true;
      ctrl.onPlaybackChanged();
    });

    const ctrl = createCallAudioRecovery({
      isConnected: () => connected,
      canPlaybackAudio: () => canPlay,
      startAudio,
    });

    ctrl.onRoomActive();
    await Promise.resolve();
    await Promise.resolve();

    expect(startAudio).toHaveBeenCalledTimes(1);
    expect(ctrl.isBlockedByPolicy()).toBe(true);

    // Повторные auto-триггеры и watchdog не должны долбить startAudio() без жеста пользователя.
    canPlay = false;
    ctrl.onPlaybackChanged();
    ctrl.onRoomActive();
    ctrl.onForeground();
    ctrl.onWatchdogTick();
    await Promise.resolve();

    expect(startAudio).toHaveBeenCalledTimes(1);
    connected = false;
    ctrl.dispose();
  });

  it('разблокирует звук на жесте пользователя один раз (дедуп pointerdown+click)', async () => {
    let canPlay = false;
    let clock = 1000;
    const onUnlock = vi.fn();
    const resumeElements = vi.fn(() => false);
    const startAudio = vi.fn(async () => {
      canPlay = true;
    });

    const ctrl = createCallAudioRecovery({
      isConnected: () => true,
      canPlaybackAudio: () => canPlay,
      startAudio,
      resumePausedAudioElements: resumeElements,
      onUserGestureUnlock: onUnlock,
      now: () => clock,
      gestureThrottleMs: 250,
    });

    // Блокировка от браузера
    ctrl.onPlaybackChanged();
    expect(ctrl.isBlockedByPolicy()).toBe(true);

    // Один тап порождает pointerdown + click в пределах 20 мс;
    // startAudio должен вызваться синхронно в стеке жеста (важно для Safari autoplay policy).
    ctrl.onGesture();
    expect(startAudio).toHaveBeenCalledTimes(1);
    clock += 20;
    ctrl.onGesture();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startAudio).toHaveBeenCalledTimes(1);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(ctrl.isBlockedByPolicy()).toBe(false);
    expect(resumeElements).toHaveBeenCalledTimes(1);

    // Следующие обычные клики по UI, когда звук уже играет, не дёргают startAudio()
    clock += 1000;
    ctrl.onGesture();
    expect(startAudio).toHaveBeenCalledTimes(1);
    ctrl.dispose();
  });

  it('watchdog будит <audio> на паузе, когда воспроизведение разрешено, и молчит до подключения', () => {
    let connected = false;
    let canPlay = true;
    const resumeElements = vi.fn(() => true);
    const startAudio = vi.fn(async () => undefined);

    const ctrl = createCallAudioRecovery({
      isConnected: () => connected,
      canPlaybackAudio: () => canPlay,
      startAudio,
      resumePausedAudioElements: resumeElements,
    });

    ctrl.onRoomActive();
    ctrl.onWatchdogTick();
    expect(startAudio).not.toHaveBeenCalled();
    expect(resumeElements).not.toHaveBeenCalled();

    connected = true;
    ctrl.onWatchdogTick();
    expect(resumeElements).toHaveBeenCalledTimes(1);
    expect(startAudio).not.toHaveBeenCalled();

    canPlay = false;
    ctrl.onPlaybackChanged();
    ctrl.onWatchdogTick();
    expect(resumeElements).toHaveBeenCalledTimes(1);
    expect(startAudio).not.toHaveBeenCalled();

    // Внешняя разблокировка (например, кнопка <StartAudio>) снимает флаг блокировки
    canPlay = true;
    ctrl.onPlaybackChanged();
    expect(ctrl.isBlockedByPolicy()).toBe(false);
    ctrl.onWatchdogTick();
    expect(resumeElements).toHaveBeenCalledTimes(2);
    ctrl.dispose();
  });
});
