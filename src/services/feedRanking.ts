/**
 * Умный ранжировщик церковной ленты.
 *
 * Цели (лучше «чистой хронологии» и типичного engagement-only Instagram):
 * 1. Качество обсуждения важнее голых лайков (комменты/репосты весят больше).
 * 2. Свежесть + velocity — новые и «разгоняющиеся» посты поднимаются.
 * 3. Персональная близость — авторы, с которыми вы уже взаимодействовали.
 * 4. Разнообразие авторов — никто не забивает ленту подряд.
 * 5. Анти-флуд — частые посты одного автора мягко приглушаются.
 * 6. Детерминированный exploration-salt на день — стабильная пагинация.
 */

export type RankableFeedPost = {
  id: string;
  member_id: number;
  created_at: string;
  like_count: number;
  comment_count: number;
  repost_count: number;
  media_count: number;
  has_video: boolean;
  caption_len: number;
  is_repost: boolean;
  is_own: boolean;
  is_admin: boolean;
  author_likes_from_me: number;
  author_comments_from_me: number;
  likes_6h: number;
  comments_6h: number;
  author_post_count_7d: number;
};

export type ScoredFeedPost<T extends RankableFeedPost = RankableFeedPost> = T & {
  rank_score: number;
};

export type RankableStoryGroup = {
  member_id: number;
  is_me: boolean;
  all_seen: boolean;
  unseen_count: number;
  story_count: number;
  newest_created_at: string;
  author_likes_from_me: number;
  author_comments_from_me: number;
  has_avatar: boolean;
};

/** Мультивентуальный PRNG (mulberry32) — стабильный seed → стабильный порядок. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function feedDayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function viewerDaySeed(viewerMemberId: number, dayKey: string): string {
  const n = hashStringToSeed(`feed:${viewerMemberId}:${dayKey}`);
  return n.toString(16).padStart(8, '0');
}

function ageHours(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 48;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

/** Базовый score поста (без author-diversity). */
export function scoreFeedPost(
  post: RankableFeedPost,
  nowMs: number,
  rngForPost: () => number,
): number {
  const ageH = ageHours(post.created_at, nowMs);

  const likes = Math.max(0, post.like_count);
  const comments = Math.max(0, post.comment_count);
  const reposts = Math.max(0, post.repost_count);

  // Обсуждение > лайк > «тихий» репост без контекста.
  const rawEng = likes * 1 + comments * 3.6 + reposts * 4.2;
  // Bayesian-сглаживание: 1 лайк не делает пост «вирусным».
  const quality = (rawEng + 1.4) / (rawEng + 9);

  const velocity = Math.max(0, post.likes_6h) * 2.4 + Math.max(0, post.comments_6h) * 5.5;

  // Мягкая гравитация: значимые посты живут дольше, чем в чистом Instagram-decay.
  const gravity = (ageH + 2.8) ** 1.22;

  let score = (rawEng * quality * 14 + velocity * 9 + 5) / gravity;

  // Свежий контент всегда имеет шанс попасть наверх.
  if (ageH < 1.5) score += 8 * (1 - ageH / 1.5);
  else if (ageH < 8) score += 3.2 * (1 - ageH / 8);
  else if (ageH < 36) score += 1.1 * (1 - ageH / 36);

  // Богатство контента.
  if (post.media_count > 0) score *= 1.14;
  if (post.media_count >= 2) score *= 1.04;
  if (post.has_video) score *= 1.07;
  if (post.caption_len >= 28 && post.caption_len <= 700) score *= 1.07;
  if (post.caption_len === 0 && post.media_count === 0) score *= 0.5;

  // Пустой репост — ниже приоритет, но не прячем.
  if (post.is_repost && post.caption_len < 8) score *= 0.8;

  // Персональная близость к автору (без follow-графа).
  const affinity = Math.min(
    14,
    post.author_likes_from_me * 0.85 + post.author_comments_from_me * 2.4,
  );
  score *= 1 + affinity * 0.035;

  if (post.is_own) score *= 1.1;
  if (post.is_admin && ageH < 48) score *= 1.12;

  // Анти-флуд одного автора за неделю.
  if (post.author_post_count_7d >= 10) score *= 0.86;
  if (post.author_post_count_7d >= 18) score *= 0.72;

  // Exploration: ±8%, детерминированно на (seed, postId).
  score *= 0.92 + rngForPost() * 0.16;

  return score;
}

function postRng(seedHex: string, postId: string): () => number {
  return mulberry32(hashStringToSeed(`${seedHex}:${postId}`));
}

export function rankFeedPosts<T extends RankableFeedPost>(
  posts: T[],
  opts: { nowMs?: number; seedHex: string },
): ScoredFeedPost<T>[] {
  const nowMs = opts.nowMs ?? Date.now();
  const scored: ScoredFeedPost<T>[] = posts.map((p) => ({
    ...p,
    rank_score: scoreFeedPost(p, nowMs, postRng(opts.seedHex, p.id)),
  }));

  scored.sort((a, b) => {
    if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
    const tb = Date.parse(b.created_at) || 0;
    const ta = Date.parse(a.created_at) || 0;
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });

  return diversifyByAuthor(scored);
}

/**
 * Жадное переупорядочивание: не даём одному автору занять несколько слотов подряд,
 * если в окне есть достойная альтернатива (≥ ~42% score лидера окна).
 */
export function diversifyByAuthor<T extends { member_id: number; rank_score: number }>(
  ranked: T[],
  opts?: { lookAhead?: number; streakPenalty?: number; minAltRatio?: number },
): T[] {
  if (ranked.length <= 2) return ranked;
  const lookAhead = opts?.lookAhead ?? 14;
  const streakPenalty = opts?.streakPenalty ?? 0.48;
  const minAltRatio = opts?.minAltRatio ?? 0.42;
  const remaining = [...ranked];
  const out: T[] = [];
  let lastAuthor: number | null = null;
  let streak = 0;

  while (remaining.length > 0) {
    const window = remaining.slice(0, Math.min(lookAhead, remaining.length));
    const windowBest = window.reduce((m, x) => Math.max(m, x.rank_score), 0);
    const hasAlt =
      lastAuthor != null &&
      window.some(
        (x) => x.member_id !== lastAuthor && x.rank_score >= windowBest * minAltRatio,
      );

    let bestIdx = 0;
    let bestAdj = -Infinity;
    for (let i = 0; i < window.length; i += 1) {
      const item = window[i]!;
      let adj = item.rank_score;
      // Чем дальше в окне — тем сильнее штраф за «перепрыгивание».
      adj *= 1 - i * 0.015;
      if (lastAuthor != null && item.member_id === lastAuthor) {
        if (hasAlt) {
          // Жёстко откладываем повтор автора, пока есть альтернатива.
          adj *= 0.08;
        } else {
          adj *= streakPenalty ** Math.min(streak, 4);
        }
      }
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0]!;
    if (lastAuthor === picked.member_id) streak += 1;
    else {
      lastAuthor = picked.member_id;
      streak = 1;
    }
    out.push(picked);
  }
  return out;
}

export function scoreStoryGroup(g: RankableStoryGroup, nowMs: number): number {
  if (g.is_me) return 1_000_000;

  const ageH = ageHours(g.newest_created_at, nowMs);
  const unseenRatio = g.story_count > 0 ? g.unseen_count / g.story_count : 0;

  let score = 0;
  // Непросмотренные — главный приоритет.
  score += g.unseen_count * 40;
  score += unseenRatio * 28;
  if (g.all_seen) score -= 120;

  // Свежесть последней сторис.
  score += Math.max(0, 36 - ageH) * 1.35;

  // Больше сторис у автора = чуть интереснее «пачка».
  score += Math.min(g.story_count, 6) * 2.2;

  // Affinity к автору.
  const affinity = Math.min(
    16,
    g.author_likes_from_me * 0.9 + g.author_comments_from_me * 2.5,
  );
  score += affinity * 3.2;

  if (g.has_avatar) score += 2;

  // Частично просмотренные (есть unseen) выше полностью просмотренных —
  // уже учтено через all_seen / unseen_count.
  return score;
}

export function rankStoryGroups<T extends RankableStoryGroup>(
  groups: T[],
  nowMs: number = Date.now(),
): T[] {
  return [...groups].sort((a, b) => {
    const sb = scoreStoryGroup(b, nowMs);
    const sa = scoreStoryGroup(a, nowMs);
    if (sb !== sa) return sb - sa;
    return (b.newest_created_at || '').localeCompare(a.newest_created_at || '');
  });
}

/* ——— cursors ——— */

export type SmartFeedCursorV1 = {
  v: 1;
  mode: 'smart';
  phase: 'ranked' | 'chrono';
  off: number;
  day: string;
  seed: string;
  /** Для chrono-хвоста: keyset по времени. */
  t?: string;
  id?: string;
};

export type RecentFeedCursor = {
  mode?: 'recent';
  t: string;
  id: string;
};

export function encodeSmartCursor(c: SmartFeedCursorV1): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeFeedListCursor(raw: string | undefined | null): SmartFeedCursorV1 | RecentFeedCursor | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw.trim(), 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (parsed && parsed.v === 1 && parsed.mode === 'smart') {
      const phase = parsed.phase === 'chrono' ? 'chrono' : 'ranked';
      const off = Number(parsed.off);
      const day = typeof parsed.day === 'string' ? parsed.day : '';
      const seed = typeof parsed.seed === 'string' ? parsed.seed : '';
      if (!day || !seed || !Number.isFinite(off) || off < 0) return null;
      const cur: SmartFeedCursorV1 = {
        v: 1,
        mode: 'smart',
        phase,
        off: Math.floor(off),
        day,
        seed,
      };
      if (typeof parsed.t === 'string' && typeof parsed.id === 'string' && /^\d+$/.test(parsed.id)) {
        cur.t = parsed.t;
        cur.id = parsed.id;
      }
      return cur;
    }
    // Legacy chronological cursor { t, id }
    if (typeof parsed.t === 'string' && typeof parsed.id === 'string' && /^\d+$/.test(parsed.id)) {
      return { mode: 'recent', t: parsed.t, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeRecentCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ mode: 'recent', t: createdAt, id }), 'utf8').toString(
    'base64url',
  );
}
