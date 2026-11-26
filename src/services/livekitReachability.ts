/**
 * Страховка от «зависаний» при обращении к Room Service LiveKit.
 *
 * Раньше запросы к недоступным внутренним адресам (docker→host:7880 за файрволом) ждали по несколько секунд
 * каждый, а адресов-кандидатов пять — создание конференции тянулось десятки секунд и не укладывалось
 * в таймаут приложения. Здесь: жёсткий таймаут на попытку, пауза для адресов, которые только что не ответили,
 * и память о комнатах, которые уже подготовлены (комната всё равно создаётся при первом входе).
 */

export class RoomServiceTimeoutError extends Error {
  constructor(label: string, ms: number) {
    // «ETIMEDOUT» — чтобы fallback по адресам считал это временной недоступностью, а не ошибкой ключей.
    super(`${label}: ETIMEDOUT after ${ms}ms`);
    this.name = 'RoomServiceTimeoutError';
  }
}

/** Ждёт [promise] не дольше [ms]. Сам запрос при таймауте не отменяется, но результат больше не нужен. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RoomServiceTimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Какие адреса Room Service недавно не ответили: их пробуем в последнюю очередь. */
export class UrlHealth {
  private readonly failedAt = new Map<string, number>();

  constructor(
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  markFailed(url: string): void {
    this.failedAt.set(url, this.now());
  }

  markOk(url: string): void {
    this.failedAt.delete(url);
  }

  isCoolingDown(url: string): boolean {
    const at = this.failedAt.get(url);
    if (at == null) return false;
    if (this.now() - at >= this.cooldownMs) {
      this.failedAt.delete(url);
      return false;
    }
    return true;
  }

  /** Исправные (или давно не проверявшиеся) адреса — вперёд, недавно упавшие — в конец; внутри групп порядок прежний. */
  order(urls: string[]): string[] {
    const healthy = urls.filter((u) => !this.isCoolingDown(u));
    const cooling = urls.filter((u) => this.isCoolingDown(u));
    return [...healthy, ...cooling];
  }
}

/** Комнаты, которые уже подготовлены на сервере LiveKit, — повторно создавать не нужно (запрос токена сразу после создания). */
export class EnsuredRooms {
  private readonly until = new Map<string, number>();

  constructor(
    private readonly okTtlMs = 10 * 60_000,
    private readonly failTtlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  shouldSkip(room: string): boolean {
    const until = this.until.get(room);
    if (until == null) return false;
    if (this.now() >= until) {
      this.until.delete(room);
      return false;
    }
    return true;
  }

  markOk(room: string): void {
    this.until.set(room, this.now() + this.okTtlMs);
    this.trim();
  }

  /** Подготовить не удалось: комната создастся при первом входе, а повторными попытками не задерживаем людей. */
  markFailed(room: string): void {
    this.until.set(room, this.now() + this.failTtlMs);
    this.trim();
  }

  private trim(): void {
    if (this.until.size < 500) return;
    const now = this.now();
    for (const [room, until] of this.until) {
      if (until <= now) this.until.delete(room);
    }
  }
}

function envMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 200 ? Math.floor(n) : fallback;
}

/** Сколько ждать ответа от одного адреса Room Service. */
export function roomServiceAttemptTimeoutMs(): number {
  return envMs('LIVEKIT_ROOM_SERVICE_TIMEOUT_MS', 2500);
}

/** Сколько всего готовим комнату перед ответом пользователю (комната создастся и при входе). */
export function roomEnsureBudgetMs(): number {
  return envMs('LIVEKIT_ROOM_ENSURE_BUDGET_MS', 4000);
}
