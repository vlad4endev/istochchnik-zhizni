import { apiClient } from '../lib/apiClient';

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

export async function fetchPodcastFeed(params?: { limit?: number }): Promise<PodcastFeedResponse> {
  const { data } = await apiClient.get<PodcastFeedResponse>('/api/resources/podcasts', {
    params: params?.limit ? { limit: params.limit } : undefined,
  });
  return data;
}

export async function fetchPodcastSettings(): Promise<{ rss_url: string | null }> {
  const { data } = await apiClient.get<{ rss_url: string | null }>('/api/resources/podcasts/settings');
  return data;
}

export async function patchPodcastSettings(rss_url: string | null): Promise<{ rss_url: string | null }> {
  const { data } = await apiClient.patch<{ rss_url: string | null }>('/api/resources/podcasts/settings', { rss_url });
  return data;
}

