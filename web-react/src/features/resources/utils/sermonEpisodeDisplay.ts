export type ParsedEpisodeTitle = {
  topic: string;
  author: string | null;
};

/** Split RSS titles like "Тема проповеди | Имя Автора". */
export function parseEpisodeTitle(raw: string): ParsedEpisodeTitle {
  const title = raw.trim();
  if (!title) return { topic: '', author: null };

  const pipeIdx = title.indexOf('|');
  if (pipeIdx <= 0 || pipeIdx >= title.length - 1) {
    return { topic: title, author: null };
  }

  const topic = title.slice(0, pipeIdx).trim();
  const author = title.slice(pipeIdx + 1).trim();
  if (!topic || !author) return { topic: title, author: null };
  return { topic, author };
}

const BOILERPLATE_PATTERNS = [
  /присоединяйтесь/i,
  /соц\.?\s*сет/i,
  /социальн(ых|ые)\s+сет/i,
  /будьте в курсе/i,
  /подписывайтесь/i,
  /follow us/i,
  /subscribe/i,
];

/** Hide feed-footer / social boilerplate that repeats on every episode. */
export function isBoilerplateDescription(
  description: string | null | undefined,
  feedDescription?: string | null,
): boolean {
  const text = (description ?? '').trim();
  if (!text) return true;

  const feed = (feedDescription ?? '').trim();
  if (feed && text.toLowerCase() === feed.toLowerCase()) return true;

  // Short social CTAs that dominate the snippet
  if (BOILERPLATE_PATTERNS.some((re) => re.test(text))) {
    // Keep if there is a substantial unique lead before the CTA
    const firstSentence = text.split(/(?<=[.!?…])\s+/)[0] ?? text;
    if (firstSentence.length < 80 || BOILERPLATE_PATTERNS.some((re) => re.test(firstSentence))) {
      return true;
    }
  }

  return false;
}

export function episodeDisplayDescription(
  description: string | null | undefined,
  feedDescription?: string | null,
): string | null {
  if (isBoilerplateDescription(description, feedDescription)) return null;
  return (description ?? '').trim() || null;
}
