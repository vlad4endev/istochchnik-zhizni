import { beforeAll, describe, expect, it } from 'vitest';

import type { JournalEvent, NetworkSample } from '../src/features/calls/callJournal';

type CallJournalModule = typeof import('../src/features/calls/callJournal');

function installMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

let mod: CallJournalModule;

beforeAll(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: installMemoryStorage(),
      configurable: true,
    });
  }
  mod = await import('../src/features/calls/callJournal');
});

describe('humanizeCallErrorMessage', () => {
  it('переводит ICE-ошибку подключения', () => {
    expect(mod.humanizeCallErrorMessage('could not establish pc connection')).toContain(
      'медиасоединение',
    );
  });

  it('переводит внутреннюю гонку сигналинга livekit', () => {
    const text = mod.humanizeCallErrorMessage(
      "could not establish signal connection: cannot establish a signal session from 'connected', close the current one first",
    );
    expect(text).toContain('сигналинга');
    expect(text).not.toContain('signal session');
  });

  it('помечает штатное отключение клиента как несбой', () => {
    expect(mod.humanizeCallErrorMessage('Client initiated disconnect')).toContain('не является сбоем');
  });

  it('неизвестные сообщения возвращает без изменений', () => {
    expect(mod.humanizeCallErrorMessage('some totally unknown failure')).toBe(
      'some totally unknown failure',
    );
  });
});

describe('isBenignRoomErrorMessage', () => {
  it('client initiated disconnect — штатный teardown', () => {
    expect(mod.isBenignRoomErrorMessage('Client initiated disconnect')).toBe(true);
  });

  it('реальные ошибки не фильтрует', () => {
    expect(mod.isBenignRoomErrorMessage('could not establish pc connection')).toBe(false);
  });
});

describe('createNetworkChangeSampler', () => {
  it('троттлит частые изменения и считает подавленные в flips', () => {
    let t = 0;
    const emitted: Array<NetworkSample & { flips?: number }> = [];
    const sample = mod.createNetworkChangeSampler((s) => emitted.push(s), {
      minIntervalMs: 15_000,
      now: () => t,
    });

    sample({ effectiveType: '4g', downlink: 10, rtt: 100 });
    t = 1_000;
    sample({ effectiveType: '4g', downlink: 10, rtt: 100 }); // без изменений — пропуск
    t = 2_000;
    sample({ effectiveType: '3g', downlink: 1, rtt: 400 }); // подавлено, flips=1
    t = 3_000;
    sample({ effectiveType: '4g', downlink: 10, rtt: 150 }); // подавлено, flips=2
    t = 4_000;
    sample({ effectiveType: '4g', downlink: 10, rtt: 150 }); // тот же снимок — не считается
    t = 20_000;
    sample({ effectiveType: '3g', downlink: 2, rtt: 300 }); // окно прошло — emit с flips=2

    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({ effectiveType: '4g', rtt: 100 });
    expect(emitted[0].flips).toBeUndefined();
    expect(emitted[1]).toMatchObject({ effectiveType: '3g', rtt: 300, flips: 2 });
  });

  it('после emit счётчик flips сбрасывается', () => {
    let t = 0;
    const emitted: Array<NetworkSample & { flips?: number }> = [];
    const sample = mod.createNetworkChangeSampler((s) => emitted.push(s), {
      minIntervalMs: 15_000,
      now: () => t,
    });

    sample({ effectiveType: '4g', downlink: 10, rtt: 100 });
    t = 1_000;
    sample({ effectiveType: '3g', downlink: 1, rtt: 400 });
    t = 20_000;
    sample({ effectiveType: '4g', downlink: 10, rtt: 200 });
    t = 40_000;
    sample({ effectiveType: '4g', downlink: 5, rtt: 250 });

    expect(emitted).toHaveLength(3);
    expect(emitted[1].flips).toBe(1);
    expect(emitted[2].flips).toBeUndefined();
  });
});

describe('mergeDuplicateErrorEvent', () => {
  const mk = (kind: string, message: string, at: string): JournalEvent => ({
    kind,
    severity: 'error',
    at,
    payload: { message },
  });

  it('схлопывает одинаковые подряд ошибки в repeat', () => {
    const buffer: JournalEvent[] = [mk('room_error', 'boom', '2026-11-03T06:35:27.000Z')];

    expect(mod.mergeDuplicateErrorEvent(buffer, mk('room_error', 'boom', '2026-11-03T06:35:27.500Z'))).toBe(true);
    expect(buffer).toHaveLength(1);
    expect(buffer[0].payload?.repeat).toBe(2);

    // Повторное слияние: repeat в payload не мешает сравнению.
    expect(mod.mergeDuplicateErrorEvent(buffer, mk('room_error', 'boom', '2026-11-03T06:35:28.000Z'))).toBe(true);
    expect(buffer).toHaveLength(1);
    expect(buffer[0].payload?.repeat).toBe(3);
  });

  it('не схлопывает разные сообщения', () => {
    const buffer: JournalEvent[] = [mk('room_error', 'boom', '2026-11-03T06:35:27.000Z')];
    expect(mod.mergeDuplicateErrorEvent(buffer, mk('room_error', 'other', '2026-11-03T06:35:27.500Z'))).toBe(false);
  });

  it('не схлопывает разные типы событий', () => {
    const buffer: JournalEvent[] = [mk('room_error', 'boom', '2026-11-03T06:35:27.000Z')];
    expect(mod.mergeDuplicateErrorEvent(buffer, mk('device_error', 'boom', '2026-11-03T06:35:27.500Z'))).toBe(false);
  });

  it('не схлопывает за пределами окна дедупликации', () => {
    const buffer: JournalEvent[] = [mk('room_error', 'boom', '2026-11-03T06:35:27.000Z')];
    expect(mod.mergeDuplicateErrorEvent(buffer, mk('room_error', 'boom', '2026-11-03T06:36:00.000Z'))).toBe(false);
  });
});
