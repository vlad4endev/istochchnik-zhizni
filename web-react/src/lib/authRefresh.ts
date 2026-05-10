import axios from 'axios';

import { resolveAxiosBaseURL } from './config';

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Обновляет access/refresh cookies через POST /api/auth/refresh.
 * Один общий in-flight promise на всё приложение (401-интерсептор + keep-alive).
 */
export function performAuthRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const baseURL = resolveAxiosBaseURL() ?? '';
      const response = await axios.post(`${baseURL}/api/auth/refresh`, null, {
        timeout: 25_000,
        withCredentials: true,
        validateStatus: (s) => s !== undefined && s < 500,
      });
      if (response.status !== 200) {
        return null;
      }
      const data = response.data as { accessToken?: unknown; token?: unknown } | undefined;
      const nextTokenRaw = data?.accessToken ?? data?.token;
      const nextToken = typeof nextTokenRaw === 'string' ? nextTokenRaw.trim() : '';
      return nextToken || null;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
