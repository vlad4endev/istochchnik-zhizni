/**
 * Флаг намеренного завершения сессии (logout / выход в другой вкладке).
 * Пока активен — apiClient не показывает toast о «Нет связи» / «Сессия истекла»
 * и не гоняет refresh по 401 от уже ненужных фоновых запросов.
 */

let teardownActive = false;
let teardownHoldTimer: ReturnType<typeof setTimeout> | null = null;

/** Grace после clearSession: in-flight axios ещё могут завершиться ERR_NETWORK / 401. */
const TEARDOWN_HOLD_MS = 2_500;

export function isSessionTeardownActive(): boolean {
  return teardownActive;
}

export function beginSessionTeardown(): void {
  if (teardownHoldTimer !== null) {
    clearTimeout(teardownHoldTimer);
    teardownHoldTimer = null;
  }
  teardownActive = true;
}

/**
 * Снять флаг сразу или через holdMs (по умолчанию — короткая задержка под хвост запросов).
 */
export function endSessionTeardown(options?: { immediate?: boolean; holdMs?: number }): void {
  if (teardownHoldTimer !== null) {
    clearTimeout(teardownHoldTimer);
    teardownHoldTimer = null;
  }

  if (options?.immediate) {
    teardownActive = false;
    return;
  }

  const holdMs = options?.holdMs ?? TEARDOWN_HOLD_MS;
  // Уже могли вызвать begin снова — не гасим раньше времени.
  if (!teardownActive) return;
  teardownHoldTimer = setTimeout(() => {
    teardownHoldTimer = null;
    teardownActive = false;
  }, holdMs);
}

/** Только для тестов. */
export function resetSessionTeardownForTests(): void {
  if (teardownHoldTimer !== null) {
    clearTimeout(teardownHoldTimer);
    teardownHoldTimer = null;
  }
  teardownActive = false;
}
