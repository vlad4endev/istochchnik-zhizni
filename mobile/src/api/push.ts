import { apiClient } from './client';

/** Передать серверу токен устройства: на него приходят звонки и уведомления, даже когда приложение закрыто. */
export async function saveFcmToken(fcmToken: string, deviceId: string): Promise<void> {
  await apiClient.post('/api/notifications/save-token', { fcm_token: fcmToken, device_id: deviceId });
}

/** При выходе из аккаунта: этому устройству больше не шлём чужие звонки. */
export async function removeFcmToken(deviceId: string): Promise<void> {
  await apiClient.post('/api/notifications/remove-token', { device_id: deviceId });
}
