import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Исходящий прокси для push: на части хостингов fcm.googleapis.com / oauth2.googleapis.com недоступны
 * (таймаут), при этом Apple и остальной интернет работают. PUSH_PROXY_URL=http://host:port (можно с user:pass@).
 * По умолчанию через прокси идут только *.googleapis.com (Android Web Push и FCM); PUSH_PROXY_ALL=1 — все.
 */
export function getPushProxyUrl(): string | null {
  const url = process.env.PUSH_PROXY_URL?.trim();
  return url ? url : null;
}

export function pushProxyForEndpoint(endpoint: string): string | undefined {
  const url = getPushProxyUrl();
  if (!url) return undefined;
  if (process.env.PUSH_PROXY_ALL?.trim() === '1') return url;
  try {
    return new URL(endpoint).hostname.endsWith('googleapis.com') ? url : undefined;
  } catch {
    return undefined;
  }
}

export function createPushProxyAgent(): HttpsProxyAgent<string> | undefined {
  const url = getPushProxyUrl();
  return url ? new HttpsProxyAgent(url) : undefined;
}
