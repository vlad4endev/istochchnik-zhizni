import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCamera, LuPlus, LuUser } from 'react-icons/lu';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useMe } from '../../../hooks/useMe';
import { ProfileComposeModal } from '../../profile/components/ProfileComposeModal';
import {
  likeProfilePost,
  repostProfilePost,
  unlikeProfilePost,
} from '../../profile/publicProfileApi';
import profileShell from '../../profile/profileShell.module.css';
import { CommentSheet } from '../components/CommentSheet';
import { FeedPostCard, type FeedCardPost } from '../components/FeedPostCard';
import { StoryComposeModal } from '../components/StoryComposeModal';
import { StoryRingBar } from '../components/StoryRingBar';
import { StoryViewer } from '../components/StoryViewer';
import { keys } from '../../../lib/queryKeys';
import {
  fetchChurchFeed,
  fetchStories,
  markFeedSeen,
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
      // Просмотрел ленту → сразу убираем бейдж в меню.
      const newest = page.posts[0]?.created_at ?? null;
      qc.setQueryData(keys.feedUnread, 0);
      try {
        await markFeedSeen(newest);
        void qc.invalidateQueries({ queryKey: keys.feedUnread });
      } catch {
        /* бейдж обновится при следующем опросе */
      }
    } catch {
      setError('Не удалось загрузить ленту');
      setPosts([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [qc]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
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
  };

  const patchPost = (postId: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  };

  const onToggleLike = async (post: FeedCardPost) => {
    if (!me) return;
    const key = `like-${post.id}`;
    setBusy((b) => ({ ...b, [key]: '1' }));
    const liked = post.liked_by_me ?? false;
    try {
      if (liked) {
        const r = await unlikeProfilePost(post.id);
        patchPost(post.id, { liked_by_me: false, like_count: r.like_count });
      } else {
        const r = await likeProfilePost(post.id);
        patchPost(post.id, { liked_by_me: true, like_count: r.like_count });
      }
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
      <div className={styles.topBar}>
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

      <div className={styles.storiesWrap}>
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
      </div>

      <main className={styles.feed}>
        {loading ? (
          <>
            <div className={styles.skel} aria-hidden />
            <div className={styles.skel} aria-hidden />
            <div className={styles.skel} aria-hidden />
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
          posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              canInteract={Boolean(me)}
              likeBusy={!!busy[`like-${post.id}`]}
              repostBusy={!!busy[`repost-${post.id}`]}
              profileLinkState={profileLinkState}
              onToggleLike={(p) => void onToggleLike(p)}
              onRepost={(p) => void onRepost(p)}
              onOpenComments={(p) => setCommentPostId(p.id)}
            />
          ))}

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

      <button
        type="button"
        className={styles.fab}
        aria-label="Новая публикация"
        onClick={() => setComposeOpen(true)}
      >
        <LuPlus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
      </button>

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
