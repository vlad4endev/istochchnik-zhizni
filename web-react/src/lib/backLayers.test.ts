import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = { state: unknown };

/** Минимальная модель window.history + popstate для Node-окружения. */
function installFakeWindow() {
  const entries: Entry[] = [{ state: null }];
  let index = 0;
  const listeners: Array<() => void> = [];
  const history = {
    get state() {
      return entries[index].state;
    },
    pushState(state: unknown) {
      entries.splice(index + 1);
      entries.push({ state });
      index += 1;
    },
    go(delta: number) {
      const next = Math.min(Math.max(index + delta, 0), entries.length - 1);
      if (next === index) return;
      index = next;
      setTimeout(() => listeners.forEach((l) => l()), 0);
    },
  };
  vi.stubGlobal('window', {
    history,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'popstate') listeners.push(fn);
    },
  });
  return { history, entries, getIndex: () => index };
}

describe('backLayers', () => {
  let mod: typeof import('./backLayers');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mod = await import('./backLayers');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Назад вызывает onBack слоя и не уходит со страницы дальше', async () => {
    const fake = installFakeWindow();
    const onBack = vi.fn();
    const { addLayerForTest } = mod.__backLayersTestApi;
    addLayerForTest(onBack);
    expect(fake.getIndex()).toBe(1);
    expect(mod.isBackLayerOnTop()).toBe(true);

    fake.history.go(-1);
    await vi.runAllTimersAsync();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mod.__backLayersTestApi.layerCount()).toBe(0);
    expect(fake.getIndex()).toBe(0);
  });

  it('вложенные слои закрываются по одному, сверху вниз', async () => {
    const fake = installFakeWindow();
    const calls: string[] = [];
    mod.__backLayersTestApi.addLayerForTest(() => calls.push('call'));
    mod.__backLayersTestApi.addLayerForTest(() => calls.push('sheet'));

    fake.history.go(-1);
    await vi.runAllTimersAsync();
    expect(calls).toEqual(['sheet']);

    fake.history.go(-1);
    await vi.runAllTimersAsync();
    expect(calls).toEqual(['sheet', 'call']);
    expect(fake.getIndex()).toBe(0);
  });

  it('слой, закрытый без «Назад», убирает свою запись из истории', async () => {
    const fake = installFakeWindow();
    const id = mod.__backLayersTestApi.addLayerForTest(() => undefined);
    expect(fake.getIndex()).toBe(1);

    mod.__backLayersTestApi.removeLayerForTest(id);
    await vi.runAllTimersAsync();

    expect(fake.getIndex()).toBe(0);
    expect(mod.isBackLayerOnTop()).toBe(false);
  });
});
