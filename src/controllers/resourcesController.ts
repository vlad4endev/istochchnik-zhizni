import type { Request, Response } from 'express';
import Parser from 'rss-parser';

export type PodcastEpisode = {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
  pubDate: string | null;
  duration: number | null;
};

type RssItemWithItunes = {
  guid?: string;
  id?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  isoDate?: string;
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
};

const parser: Parser<RssFeedWithItunes, RssItemWithItunes> = new Parser({
  customFields: {
    item: ['itunes:image', 'itunes:duration'],
  },
});

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

  return {
    id,
    title,
    audioUrl,
    imageUrl: pickImageUrl(item, feed),
    pubDate,
    duration: parseDurationToSeconds(durationRaw),
  };
}

/**
 * GET /api/resources/podcasts
 * Сейчас: тестовый RSS URL-заглушка. Позже заменим на CastBox feed URL.
 */
export async function getPodcastEpisodes(_req: Request, res: Response): Promise<void> {
  const rssUrl =
    process.env.RESOURCES_PODCAST_RSS_URL?.trim() ||
    'https://feeds.simplecast.com/54nAGcIl'; // TODO: заменить на CastBox RSS

  try {
    const feed = await parser.parseURL(rssUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const episodes = items
      .map((it, idx) => normalizeEpisode(it as RssItemWithItunes, idx, feed as RssFeedWithItunes))
      .filter((x): x is PodcastEpisode => Boolean(x));

    res.json(episodes);
  } catch (e) {
    console.error('[resources] podcasts parse error:', e);
    res.status(500).json({ error: 'Failed to load podcast feed' });
  }
}

