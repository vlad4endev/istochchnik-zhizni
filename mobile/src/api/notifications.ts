import { apiClient } from './client';

export async function saveFcmToken(params: {
  fcm_token: string;
  device_id: string;
}): Promise<void> {
  await apiClient.post(
    '/api/notifications/save-token',
    {
      fcm_token: params.fcm_token,
      device_id: params.device_id,
    },
    { timeout: 20_000 },
  );
}
