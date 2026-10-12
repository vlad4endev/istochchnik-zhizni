import { describe, expect, it, vi, afterEach } from 'vitest';

describe('callRingtone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).AudioContext;
  });

  it('plays ringtone via AudioContext and stops cleanly', async () => {
    const oscStart = vi.fn();
    const oscStop = vi.fn();

    class FakeOscillator {
      type = 'sine';
      frequency = { value: 0 };
      connect = vi.fn();
      disconnect = vi.fn();
      start = oscStart;
      stop = oscStop;
    }
    class FakeGain {
      gain = {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      };
      connect = vi.fn();
      disconnect = vi.fn();
    }
    class FakeAudioContext {
      state = 'running';
      currentTime = 1;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
      createOscillator() {
        return new FakeOscillator();
      }
      createGain() {
        return new FakeGain();
      }
    }

    const fakeWindow = {
      AudioContext: FakeAudioContext,
      webkitAudioContext: undefined,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = fakeWindow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).AudioContext = FakeAudioContext;

    vi.resetModules();
    const mod = await import('../src/features/calls/callRingtone');
    const stopFn = mod.startCallRing('ringtone');
    expect(typeof stopFn).toBe('function');
    expect(oscStart.mock.calls.length).toBeGreaterThan(0);
    stopFn();
    mod.stopCallRing();
    expect(oscStop.mock.calls.length).toBeGreaterThan(0);
  });
});
