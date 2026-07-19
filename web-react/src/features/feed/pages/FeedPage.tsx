import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCamera, LuPlus, LuUser } from 'react-icons/lu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';

import { useMe } from '../../../hooks/useMe';
import { ProfileComposeModal } from '../../profile/components/ProfileComposeModal';
import {
  likeProfilePost,
  repostProfilePost,
  unlikeProfilePost,
  type ProfileFeedPostAuthor,
} from '../../profile/publicProfileApi';
import profileShell from '../../profile/profileShell.module.css';
import { CommentSheet } from '../components/CommentSheet';
import { FeedPostCard, type FeedCardPost } from '../components/FeedPostCard';
import { StoryComposeModal } from '../components/StoryComposeModal';
import { StoryRingBar } from '../components/StoryRingBar';
import { StoryViewer } from '../components/StoryViewer';
import {
  fetchChurchFeed,
  fetchStories,
  type FeedPost,
  type StoryAuthorGroup,
} from '../feedApi';

import styles from './FeedPage.module.css';

const FEED_KEY = ['church-feed'] as const;
const STORIES_KEY = ['church-stories'] as const;

function meAsStoryGroup(me: NonNullable<ReturnType<typeof useMe>['data']>): StoryAuthorGroup {
  return {
    author: {
      member_id: me.id,
      username: me.username?.trim() || `member-${me.id}`,
      first_name: me.first_name,
      last_name: me.last_name,
      display_name: me.name || null,
      avatar_url: me.avatar_url ?? null,
    },
    stories: [],
    all_seen: true,
    is_me: true,
  };
}

export function FeedPage() {
  const meQ = useMe();
  const me = meQ.data ?? null;
  const qc = useQueryClient();
  const reduceMotion = useReducedMotion();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [storyComposeOpen, setStoryComposeOpen] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [viewerGroup, setViewerGroup] = useState<StoryAuthorGroup | null>(null);
  const [busy, setBusy] = useState<Record<string, string | undefined>>({});
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const storiesQ = useQuery({
    queryKey: STORIES_KEY,
    queryFn: fetchStories,
    staleTime: 30_000,
    retry: 1,
  });

  const storyGroups = useMemo((): StoryAuthorGroup[] => {
    const remote = storiesQ.data;
    if (remote && remote.length > 0) return remote;
    if (me) return [meAsStoryGroup(me)];
    return [];
  }, [storiesQ.data, me]);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchChurchFeed({ limit: 20 });
      setPosts(page.posts);
      setCursor(page.next_cursor);
    } catch {
      setError('Не удалось загрузить ленту');
      setPosts([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchChurchFeed({ cursor, limit: 20 });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of page.posts) {
          if (!seen.has(p.id)) merged.push(p);
        }
        return merged;
      });
      setCursor(page.next_cursor);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '280px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  const patchPost = (postId: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  };

  const onToggleLike = async (post: FeedCardPost) => {
    if (!me) return;
    const key = `like-${post.id}`;
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: '1' }));
    const liked = post.liked_by_me ?? false;
    const prevCount = post.like_count ?? 0;
    // Optimistic UI — мгновенный отклик как в нативных лентах.
    patchPost(post.id, {
      liked_by_me: !liked,
      like_count: Math.max(0, prevCount + (liked ? -1 : 1)),
    });
    try {
      if (liked) {
        const r = await unlikeProfilePost(post.id);
        patchPost(post.id, { liked_by_me: false, like_count: r.like_count });
      } else {
        const r = await likeProfilePost(post.id);
        patchPost(post.id, { liked_by_me: true, like_count: r.like_count });
      }
    } catch {
      patchPost(post.id, { liked_by_me: liked, like_count: prevCount });
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[key];
        return n;
      });
    }
  };

  const onRepost = async (post: FeedCardPost) => {
    if (!me || post.reposted_by_me) return;
    const key = `repost-${post.id}`;
    setBusy((b) => ({ ...b, [key]: '1' }));
    try {
      await repostProfilePost(post.id);
      patchPost(post.id, {
        reposted_by_me: true,
        repost_count: (post.repost_count ?? 0) + 1,
      });
      await loadFirst();
    } catch {
      /* ignore */
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[key];
        return n;
      });
    }
  };

  const myUsername = me?.username?.trim() || (me ? `member-${me.id}` : '');
  const isAdmin = (me?.app_role ?? '').toLowerCase() === 'admin';
  const profileLinkState = { backTo: '/feed', backLabel: 'Лента' };
  const myAuthor = useMemo((): ProfileFeedPostAuthor | null => {
    if (!me) return null;
    return {
      member_id: me.id,
      username: me.username?.trim() || `member-${me.id}`,
      first_name: me.first_name,
      last_name: me.last_name,
      display_name: me.name || null,
      avatar_url: me.avatar_url ?? null,
    };
  }, [me]);

  const markStoryViewedLocal = (storyId: string) => {
    qc.setQueryData<StoryAuthorGroup[]>(STORIES_KEY, (prev) => {
      if (!prev) return prev;
      return prev.map((g) => {
        const stories = g.stories.map((s) =>
          s.id === storyId ? { ...s, viewed_by_me: true } : s,
        );
        const all_seen = g.is_me ? true : stories.every((s) => s.viewed_by_me);
        return { ...g, stories, all_seen };
      });
    });
    setViewerGroup((g) => {
      if (!g) return g;
      const stories = g.stories.map((s) =>
        s.id === storyId ? { ...s, viewed_by_me: true } : s,
      );
      return {
        ...g,
        stories,
        all_seen: g.is_me ? true : stories.every((s) => s.viewed_by_me),
      };
    });
  };

  const onStoryDeleted = (storyId: string) => {
    qc.setQueryData<StoryAuthorGroup[]>(STORIES_KEY, (prev) => {
      if (!prev) return prev;
      return prev
        .map((g) => ({
          ...g,
          stories: g.stories.filter((s) => s.id !== storyId),
        }))
        .map((g) => ({
          ...g,
          all_seen: g.is_me ? true : g.stories.every((s) => s.viewed_by_me),
        }));
    });
    setViewerGroup((g) => {
      if (!g) return g;
      const stories = g.stories.filter((s) => s.id !== storyId);
      if (stories.length === 0) return null;
      return { ...g, stories };
    });
  };

  return (
    <div className={`${profileShell.profileRoot} ${styles.page}`} data-profile-root>
      <div className={`${styles.topBar} ${headerScrolled ? styles.topBarScrolled : ''}`}>
        <h1 className={styles.title}>Лента</h1>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Новая история"
            onClick={() => setStoryComposeOpen(true)}
          >
            <LuCamera className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          {myUsername ? (
            <Link
              to={`/profile/${encodeURIComponent(myUsername)}`}
              state={profileLinkState}
              className={styles.iconBtn}
              aria-label="Мой профиль"
            >
              <LuUser className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <motion.div
        className={styles.storiesWrap}
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {storiesQ.isLoading && storyGroups.length === 0 ? (
          <div className={styles.storiesSkel} aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.storiesSkelItem}>
                <div className={styles.storiesSkelRing} />
                <div className={styles.storiesSkelLabel} />
              </div>
            ))}
          </div>
        ) : (
          <StoryRingBar
            groups={storyGroups}
            onOpenGroup={(g) => setViewerGroup(g)}
            onCompose={() => setStoryComposeOpen(true)}
          />
        )}
      </motion.div>

      <main className={styles.feed}>
        {loading ? (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.skelCard} aria-hidden>
                <div className={styles.skelHead}>
                  <div className={styles.skelAvatar} />
                  <div className={styles.skelLines}>
                    <div className={`${styles.skelLine} ${styles.skelLineShort}`} />
                    <div className={`${styles.skelLine} ${styles.skelLineTiny}`} />
                  </div>
                </div>
                <div className={styles.skelMedia} />
                <div className={styles.skelActions} />
              </div>
            ))}
          </>
        ) : null}

        {!loading && error ? <p className={styles.error}>{error}</p> : null}

        {!loading && !error && posts.length === 0 ? (
          <div className={styles.empty}>
            <p>Пока нет публикаций. Поделитесь первым моментом из жизни церкви.</p>
            <button type="button" className={styles.emptyCta} onClick={() => setComposeOpen(true)}>
              <LuPlus className="h-5 w-5" aria-hidden />
              Создать публикацию
            </button>
          </div>
        ) : null}

        {!loading &&
          posts.map((post, index) => (
            <FeedPostCard
              key={post.id}
              post={post}
              appearIndex={index}
              canInteract={Boolean(me)}
              likeBusy={!!busy[`like-${post.id}`]}
              repostBusy={!!busy[`repost-${post.id}`]}
              profileLinkState={profileLinkState}
              onToggleLike={(p) => void onToggleLike(p)}
              onRepost={(p) => void onRepost(p)}
              onOpenComments={(p) => setCommentPostId(p.id)}
            />
          ))}

        {cursor ? <div ref={sentinelRef} className={styles.sentinel} aria-hidden /> : null}

        {cursor ? (
          <button
            type="button"
            className={styles.loadMore}
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Загрузка…' : 'Ещё публикации'}
          </button>
        ) : null}
      </main>

      <motion.button
        type="button"
        className={styles.fab}
        aria-label="Новая публикация"
        onClick={() => setComposeOpen(true)}
        initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.15 }}
        whileTap={reduceMotion ? undefined : { scale: 0.94 }}
      >
        <LuPlus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
      </motion.button>

      <ProfileComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPublished={() => {
          void loadFirst();
          void qc.invalidateQueries({ queryKey: FEED_KEY });
        }}
      />

      <StoryComposeModal
        open={storyComposeOpen}
        onClose={() => setStoryComposeOpen(false)}
        onPublished={() => void qc.invalidateQueries({ queryKey: STORIES_KEY })}
      />

      <CommentSheet
        open={commentPostId != null}
        postId={commentPostId}
        myMemberId={me?.id ?? null}
        myAuthor={myAuthor}
        isAdmin={isAdmin}
        profileLinkState={profileLinkState}
        onClose={() => setCommentPostId(null)}
        onCountChange={(postId, delta) => {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? { ...p, comment_count: Math.max(0, (p.comment_count ?? 0) + delta) }
                : p,
            ),
          );
        }}
      />

      <StoryViewer
        group={viewerGroup}
        onClose={() => setViewerGroup(null)}
        onViewed={markStoryViewedLocal}
        onDeleted={onStoryDeleted}
      />
    </div>
  );
}
