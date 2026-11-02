import { Platform } from 'react-native';

import { storage } from '../lib/storage';
import { apiClient } from './client';

const LS_ANALYTICS_SESSION = 'analytics_session_id';

function getAnalyticsSessionId(): string {
  const current = storage.getString(LS_ANALYTICS_SESSION);
  if (current && current.length >= 24) return current;
  const generated = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 34)}`.slice(0, 48);
  storage.set(LS_ANALYTICS_SESSION, generated);
  return generated;
}

function analyticsPlatform(): string {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
}

export async function trackScreenView(pageKey: string, screenName: string, durationSeconds: number): Promise<void> {
  try {
    await apiClient.post('/api/analytics/track/page-view', {
      page_key: pageKey,
      page_url: `app://screen/${screenName}`,
      duration_seconds: Math.max(1, Math.round(durationSeconds)),
      session_id: getAnalyticsSessionId(),
      platform: analyticsPlatform(),
      os: Platform.OS,
      device_type: 'mobile',
    });
  } catch {
    // Аналитика не должна влиять на UX: офлайн, лимиты, отключённый сбор.
  }
}

export async function trackHeartbeat(pageKey: string): Promise<void> {
  try {
    await apiClient.post('/api/analytics/track/heartbeat', {
      page_key: pageKey,
      session_id: getAnalyticsSessionId(),
      platform: analyticsPlatform(),
      os: Platform.OS,
      device_type: 'mobile',
    });
  } catch {
    // Фоновый сигнал — ошибки игнорируем.
  }
}
