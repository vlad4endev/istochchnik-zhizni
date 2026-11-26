import { useEffect, useRef } from 'react';

/**
 * Системная кнопка «Назад» / жест свайпа для полноэкранных слоёв (окно звонка, шторки поверх него).
 * Слой кладёт в history «сторожевую» запись; когда пользователь уходит назад, вместо
 * навигации по страницам вызывается `onBack` верхнего слоя (свернуть звонок, закрыть шторку).
 */

const KEY = '__appBackLayer';

type Layer = { id: number; onBack: () => void };

const layers: Layer[] = [];
let nextId = 1;
let listening = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let backInFlight = false;
let backInFlightTimer: ReturnType<typeof setTimeout> | null = null;

function currentDepth(): number {
  if (typeof window === 'undefined') return 0;
  const st = window.history.state as Record<string, unknown> | null;
  const d = st && typeof st === 'object' ? Number(st[KEY]) : 0;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function markBackSettled() {
  backInFlight = false;
  if (backInFlightTimer) {
    clearTimeout(backInFlightTimer);
    backInFlightTimer = null;
  }
}

function handlePop() {
  markBackSettled();
  const depth = currentDepth();
  while (layers.length > depth) {
    const top = layers.pop();
    try {
      top?.onBack();
    } catch {
      /* слой сам отвечает за свои ошибки */
    }
  }
  scheduleSettle();
}

/**
 * Убирает лишние «сторожевые» записи, оставшиеся после закрытия слоя не жестом «Назад»
 * (кнопка «Свернуть», завершение звонка) — иначе пришлось бы нажимать «Назад» дважды.
 */
function settle() {
  if (typeof window === 'undefined') return;
  if (backInFlight) {
    scheduleSettle();
    return;
  }
  const excess = currentDepth() - layers.length;
  if (excess <= 0) return;
  backInFlight = true;
  backInFlightTimer = setTimeout(markBackSettled, 600);
  window.history.go(-excess);
}

function scheduleSettle() {
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    settle();
  }, 0);
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', handlePop);
}

function addLayer(onBack: () => void): number {
  ensureListener();
  const id = nextId++;
  layers.push({ id, onBack });
  const base = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.pushState({ ...base, [KEY]: layers.length }, '');
  return id;
}

function removeLayer(id: number) {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return;
  layers.splice(idx, 1);
  scheduleSettle();
}

/** Есть ли открытые слои, чья «сторожевая» запись сейчас на вершине history. */
export function isBackLayerOnTop(): boolean {
  return layers.length > 0 && currentDepth() >= layers.length;
}

/** Пока `active`, жест/кнопка «Назад» вызывает `onBack` вместо ухода со страницы. */
export function useBackLayer(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    const id = addLayer(() => onBackRef.current());
    return () => removeLayer(id);
  }, [active]);
}

export const __backLayersTestApi = {
  reset() {
    layers.length = 0;
    markBackSettled();
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  },
  depth: currentDepth,
  addLayerForTest: addLayer,
  removeLayerForTest: removeLayer,
  layerCount: () => layers.length,
};
