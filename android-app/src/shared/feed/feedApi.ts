import {apiClient} from '../apiClient';
import type {ChurchFeedPage} from './types';

export async function fetchChurchFeed(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ChurchFeedPage> {
  const {data} = await apiClient.get<ChurchFeedPage>('/api/feed', {
    params: {
      cursor: params?.cursor || undefined,
      limit: params?.limit ?? 20,
      sort: 'recent',
    },
  });
  return data;
}
