import { apiClient } from '../lib/apiClient';

export type PageViewPayload = {
  page_key: string;
  page_url: string;
  referrer?: string | null;
  duration_seconds?: number;
  session_id?: string;
};

function getSessionId(): string {
  const key = 'analytics_session_id';
  const current = localStorage.getItem(key);
  if (current && current.length >= 24) return current;
  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
  localStorage.setItem(key, generated);
  return generated;
}

export async function trackPageView(data: PageViewPayload): Promise<void> {
  try {
    await apiClient.post('/api/analytics/track/page-view', {
      ...data,
      session_id: data.session_id ?? getSessionId(),
    });
  } catch {
    // Не блокируем UI: лимиты (429), офлайн, отключённая аналитика.
  }
}

export async function trackEvent(eventType: string, metadata?: object, pageKey?: string): Promise<void> {
  try {
    await apiClient.post('/api/analytics/track/event', {
      event_type: eventType,
      page_key: pageKey ?? null,
      metadata: metadata ?? {},
    });
  } catch {
    // То же для событий.
  }
}

export async function fetchAnalyticsOverview(period: string): Promise<any> {
  const { data } = await apiClient.get('/api/analytics/overview', { params: { period } });
  return data;
}

export async function fetchAnalyticsPages(period: string): Promise<any[]> {
  const { data } = await apiClient.get('/api/analytics/pages', { params: { period } });
  return data;
}

export async function fetchAnalyticsPageDetail(pageKey: string, period: string): Promise<any> {
  const { data } = await apiClient.get(`/api/analytics/pages/${encodeURIComponent(pageKey)}`, {
    params: { period },
  });
  return data;
}

export async function fetchAnalyticsUsers(params: {
  period: string;
  sort_by?: 'total_views' | 'sessions' | 'last_active';
  page_key?: string;
}): Promise<any[]> {
  const { data } = await apiClient.get('/api/analytics/users', { params });
  return data;
}

export async function fetchAnalyticsUserDetail(userId: number, period: string): Promise<any> {
  const { data } = await apiClient.get(`/api/analytics/users/${userId}`, { params: { period } });
  return data;
}

export async function fetchAnalyticsRealtime(): Promise<any> {
  const { data } = await apiClient.get('/api/analytics/realtime');
  return data;
}
