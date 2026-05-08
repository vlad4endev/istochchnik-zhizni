import { isAxiosError } from 'axios';

export function isSharePlanRateLimitError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 429;
}

/** Ретрай для polling публичного / редактируемого плана по ссылке при сетевых сбоях и 5xx. */
export function sharePlanQueryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  if (isSharePlanRateLimitError(error)) return true;
  if (isAxiosError(error)) {
    const s = error.response?.status;
    if (s == null || s >= 502) return true;
    if (s === 408 || s === 425) return true;
  }
  return false;
}

export function sharePlanQueryRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attemptIndex - 1), 4000);
}
