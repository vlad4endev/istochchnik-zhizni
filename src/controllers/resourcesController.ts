import type { Request, Response } from 'express';
import Parser from 'rss-parser';

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

type RssItemWithItunes = {
  guid?: string;
  id?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  enclosure?: { url?: string };
  itunes?: { image?: string; duration?: string };
  image?: { url?: string };
  'itunes:image'?: string;
  'itunes:duration'?: string;
};

type RssFeedWithItunes = {
  title?: string;
  link?: string;
  itunes?: { image?: string };
  description?: string;
  lastBuildDate?: string;
};

const parser: Parser<RssFeedWithItunes, RssItemWithItunes> = new Parser({
  customFields: {
    item: ['itunes:image', 'itunes:duration'],
  },
});

export type PodcastFeedResponse = {
  feed: {
    title: string;
    link: string | null;
    imageUrl: string | null;
    description: string | null;
    lastBuildDate: string | null;
    rssUrl: string;
    cached: boolean;
    fetchedAt: string;
  };
  episodes: PodcastEpisode[];
};

function parseDurationToSeconds(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Common RSS/iTunes formats:
  // - "1234" (seconds)
  // - "MM:SS"
  // - "HH:MM:SS"
  if (/^\d+$/.test(s)) return Number(s);

  const parts = s.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;

  if (nums.length === 2) {
    const [mm, ss] = nums;
    return mm * 60 + ss;
  }

  const [hh, mm, ss] = nums;
  return hh * 3600 + mm * 60 + ss;
}

function pickImageUrl(item: RssItemWithItunes, feed: RssFeedWithItunes): string | null {
  return (
    item.itunes?.image ??
    item['itunes:image'] ??
    item.image?.url ??
    feed.itunes?.image ??
    null
  );
}

function normalizeEpisode(item: RssItemWithItunes, idx: number, feed: RssFeedWithItunes): PodcastEpisode | null {
  const title = (item.title ?? '').trim();
  const audioUrl = (item.enclosure?.url ?? '').trim();
  if (!title || !audioUrl) return null;

  const id = String(item.guid ?? item.id ?? item.link ?? `${feed.link ?? 'feed'}#${idx}`);
  const pubDate = (item.isoDate ?? item.pubDate ?? null) ? String(item.isoDate ?? item.pubDate) : null;
  const durationRaw = item.itunes?.duration ?? item['itunes:duration'];
  const pageUrl = (item.link ?? '').trim() || null;
  const description =
    (item.contentSnippet ?? item.content ?? '').toString().trim().replace(/\s+/g, ' ').slice(0, 600) || null;

  return {
    id,
    title,
    audioUrl,
    imageUrl: pickImageUrl(item, feed),
    pubDate,
    duration: parseDurationToSeconds(durationRaw),
    description,
    pageUrl,
  };
}

function parseLimit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(1, Math.min(200, i));
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAtMs: number; payload: PodcastFeedResponse } | null = null;

/**
 * GET /api/resources/podcasts
 * Сейчас: тестовый RSS URL-заглушка. Позже заменим на CastBox feed URL.
 */
export async function getPodcastEpisodes(req: Request, res: Response): Promise<void> {
  const rssUrl =
    process.env.RESOURCES_PODCAST_RSS_URL?.trim() ||
    'https://feeds.simplecast.com/54nAGcIl'; // TODO: заменить на CastBox RSS
  const limit = parseLimit(req.query.limit, 80);

  try {
    const now = Date.now();
    if (cache && now - cache.fetchedAtMs < CACHE_TTL_MS && cache.payload.feed.rssUrl === rssUrl) {
      const cachedPayload: PodcastFeedResponse = {
        ...cache.payload,
        feed: { ...cache.payload.feed, cached: true },
        episodes: cache.payload.episodes.slice(0, limit),
      };
      res.json(cachedPayload);
      return;
    }

    const feed = await parser.parseURL(rssUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const episodes = items
      .map((it, idx) => normalizeEpisode(it as RssItemWithItunes, idx, feed as RssFeedWithItunes))
      .filter((x): x is PodcastEpisode => Boolean(x));

    const payload: PodcastFeedResponse = {
      feed: {
        title: String((feed as RssFeedWithItunes).title ?? 'Подкаст').trim() || 'Подкаст',
        link: (String((feed as RssFeedWithItunes).link ?? '').trim() || null) as string | null,
        imageUrl: (feed as RssFeedWithItunes).itunes?.image?.trim() || null,
        description: (String((feed as RssFeedWithItunes).description ?? '').trim() || null) as string | null,
        lastBuildDate: (String((feed as RssFeedWithItunes).lastBuildDate ?? '').trim() || null) as string | null,
        rssUrl,
        cached: false,
        fetchedAt: new Date().toISOString(),
      },
      episodes: episodes.slice(0, limit),
    };

    cache = { fetchedAtMs: now, payload };
    res.json(payload);
  } catch (e) {
    console.error('[resources] podcasts parse error:', e);
    res.status(500).json({ error: 'Failed to load podcast feed' });
  }
}

