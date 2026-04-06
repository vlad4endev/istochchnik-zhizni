import { apiClient } from '../../lib/apiClient';
import type { NotificationSettingsPublic } from './notificationSettingsTypes';

export async function fetchPublicNotificationSettings(): Promise<NotificationSettingsPublic> {
  const { data } = await apiClient.get<NotificationSettingsPublic>('/api/settings/notifications');
  return data;
}

export async function fetchAdminNotificationSettings(): Promise<NotificationSettingsPublic> {
  const { data } = await apiClient.get<NotificationSettingsPublic>('/api/settings/notifications/admin');
  return data;
}

export async function patchNotificationSettings(body: {
  timezone: string;
  rules: NotificationSettingsPublic['rules'];
}): Promise<NotificationSettingsPublic> {
  const { data } = await apiClient.patch<NotificationSettingsPublic>('/api/settings/notifications', body);
  return data;
}
