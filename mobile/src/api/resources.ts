import { apiClient } from './client';

export type PodcastEpisode = {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
  pubDate: string | null;
  duration: number | null;
  description: string | null;
  pageUrl: string | null;
};

export type PodcastFeed = {
  title: string;
  link: string | null;
  imageUrl: string | null;
  description: string | null;
  lastBuildDate: string | null;
  rssUrl: string;
  cached: boolean;
  fetchedAt: string;
};

export type PodcastFeedResponse = {
  feed: PodcastFeed;
  episodes: PodcastEpisode[];
};

export async function fetchPodcastFeed(params?: {
  limit?: number;
}): Promise<PodcastFeedResponse> {
  const { data } = await apiClient.get<PodcastFeedResponse>('/api/resources/podcasts', {
    params: params?.limit ? { limit: params.limit } : undefined,
  });
  return data;
}
