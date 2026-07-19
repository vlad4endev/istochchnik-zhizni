import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LuCamera,
  LuChevronLeft,
  LuLayoutGrid,
  LuPlus,
  LuSettings,
  LuUser,
} from 'react-icons/lu';

import { CommentSheet } from '../../feed/components/CommentSheet';
import { FeedPostCard, type FeedCardPost } from '../../feed/components/FeedPostCard';
import { fetchMe, uploadMyAvatar, type MeResponse } from '../api';
import {
  deleteProfilePost,
  fetchProfileByUsername,
  likeProfilePost,
  repostProfilePost,
  type ProfileFeedPost,
  type ProfileFeedPostAuthor,
  type ProfileFeedResponse,
  unlikeProfilePost,
} from '../publicProfileApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { pluralizeRu } from '../../../lib/pluralizeRu';
import { ProfileComposeModal } from '../components/ProfileComposeModal';
import { EditPostModal } from '../components/EditPostModal';
import { memberNameFirstLast } from '../memberDisplayName';

import profileShell from '../profileShell.module.css';
import styles from './PublicProfilePage.module.css';

const profileRootCn = `${profileShell.profileRoot} ${styles.igPage}`;

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string') return data.error;
  }
  return 'Не удалось загрузить профиль';
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = username ? decodeURIComponent(username) : '';
  const backTo =
    typeof (location.state as { backTo?: unknown } | null)?.backTo === 'string'
      ? ((location.state as { backTo: string }).backTo || '/dashboard')
      : '/dashboard';
  const backLabel =
    typeof (location.state as { backLabel?: unknown } | null)?.backLabel === 'string'
      ? ((location.state as { backLabel: string }).backLabel || 'Назад')
      : 'Назад';

  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<ProfileFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editPost, setEditPost] = useState<ProfileFeedPost | null>(null);
  const [commentTarget, setCommentTarget] = useState<{
    postId: string;
    authorName: string | null;
  } | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [postBusy, setPostBusy] = useState<Record<string, string | undefined>>({});
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!decoded.trim()) {
      setError('Некорректное имя пользователя');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [meRes, profileRes] = await Promise.all([
        fetchMe().catch(() => null),
        fetchProfileByUsername(decoded),
      ]);
      setMe(meRes);
      setData(profileRes);
    } catch (e) {
      setData(null);
      setError(axiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [decoded]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = me != null && data != null && me.id === data.profile.member_id;
  const postsVisible = data && (!data.profile.is_private || isOwner);
  const posts = postsVisible ? data.posts : [];
  const postsLabel = pluralizeRu(posts.length, ['публикация', 'публикации', 'публикаций']);
  const isAdmin = (me?.app_role ?? '').toLowerCase() === 'admin';

  const displayName = useMemo(() => {
    if (!data) return decoded;
    const fromMember = memberNameFirstLast(data.profile);
    if (fromMember) return fromMember;
    if (isOwner && me) {
      const n = memberNameFirstLast(me);
      if (n) return n;
    }
    const fromProfile = data.profile.display_name?.trim();
    if (fromProfile) return fromProfile;
    return data.profile.username || decoded;
  }, [data, decoded, isOwner, me]);

  const isPlaceholderUsername = useMemo(() => {
    const u = data?.profile.username?.trim() ?? '';
    return u.length > 0 && /^member-\d+$/i.test(u);
  }, [data?.profile.username]);

  const headerHandleLine = useMemo(() => {
    if (!data || isPlaceholderUsername) return null;
    const u = data.profile.username?.trim();
    if (!u) return null;
    const at = `@${u}`;
    const t = displayName.trim();
    if (t.toLowerCase() === at.toLowerCase() || t.toLowerCase() === u.toLowerCase()) return null;
    return at;
  }, [data, isPlaceholderUsername, displayName]);

  const avatarSrc = useMemo(() => {
    if (!data) return null;
    return resolvePublicUrl(data.profile.avatar_url ?? null);
  }, [data]);

  const fallbackAuthor = useMemo(() => {
    if (!data) return undefined;
    return {
      member_id: data.profile.member_id,
      username: data.profile.username,
      first_name: data.profile.first_name,
      last_name: data.profile.last_name,
      display_name: data.profile.display_name,
      avatar_url: data.profile.avatar_url,
    };
  }, [data]);

  const myAuthor = useMemo((): ProfileFeedPostAuthor | null => {
    if (!me) return null;
    if (isOwner && data) {
      return {
        member_id: data.profile.member_id,
        username: data.profile.username,
        first_name: data.profile.first_name,
        last_name: data.profile.last_name,
        display_name: data.profile.display_name,
        avatar_url: data.profile.avatar_url,
      };
    }
    return {
      member_id: me.id,
      username: me.username?.trim() || `member-${me.id}`,
      first_name: me.first_name,
      last_name: me.last_name,
      display_name: me.name || null,
      avatar_url: me.avatar_url ?? null,
    };
  }, [me, isOwner, data]);

  const patchPost = useCallback((postId: string, patch: Partial<ProfileFeedPost>) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        posts: prev.posts.map((p) => (p.id === postId ? { ...p, ...patch } : p)),
      };
    });
  }, []);

  const removePost = useCallback((postId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, posts: prev.posts.filter((p) => p.id !== postId) };
    });
  }, []);

  const onDeletePost = useCallback(
    async (post: FeedCardPost) => {
      if (!window.confirm('Удалить эту публикацию? Действие необратимо.')) return;
      const key = `del-${post.id}`;
      setPostBusy((b) => ({ ...b, [key]: '1' }));
      try {
        await deleteProfilePost(post.id);
        removePost(post.id);
      } catch {
        /* ignore */
      } finally {
        setPostBusy((b) => {
          const n = { ...b };
          delete n[key];
          return n;
        });
      }
    },
    [removePost],
  );

  const onToggleLike = useCallback(
    async (post: FeedCardPost) => {
      if (!me) return;
      const busyKey = `like-${post.id}`;
      setPostBusy((b) => ({ ...b, [busyKey]: '1' }));
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
        setPostBusy((b) => {
          const next = { ...b };
          delete next[busyKey];
          return next;
        });
      }
    },
    [me, patchPost],
  );

  const onRepost = useCallback(
    async (post: FeedCardPost) => {
      if (!me || post.reposted_by_me) return;
      const busyKey = `repost-${post.id}`;
      setPostBusy((b) => ({ ...b, [busyKey]: '1' }));
      try {
        await repostProfilePost(post.id);
        await load();
      } catch {
        /* ignore */
      } finally {
        setPostBusy((b) => {
          const next = { ...b };
          delete next[busyKey];
          return next;
        });
      }
    },
    [me, load],
  );

  const onPickAvatar = async (file: File | null) => {
    if (!file || !isOwner) return;
    setAvatarBusy(true);
    try {
      const next = await uploadMyAvatar(file);
      setMe(next);
      await load();
    } catch {
      /* ignore */
    } finally {
      setAvatarBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={profileRootCn} data-profile-root>
        <div className={styles.igTopBar} aria-hidden>
          <div className={styles.igTopBarSkelBtn} />
          <div className={styles.igTopBarSkelTitleWrap}>
            <div className={styles.igTopBarSkelTitle} />
          </div>
          <div className={styles.igTopBarSkelBtn} />
        </div>
        <div className={styles.igHeader}>
          <div className={styles.igHeaderInner}>
            <div className={styles.igSkelRow}>
              <div className={styles.igSkelAvatar} aria-hidden />
              <div className={styles.igSkelMeta}>
                <div className={`${styles.igSkelLine} ${styles.igSkelLineLg}`} />
                <div className={`${styles.igSkelLine} ${styles.igSkelLineSm}`} />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.igFeedSection}>
          <div className={styles.fbFeed}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.fbSkelCard} aria-hidden />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={profileRootCn} data-profile-root>
        <div className={styles.igError}>
          <p>{error ?? 'Профиль не найден'}</p>
          <Link to="/feed" className={styles.igErrorLink}>
            В ленту
          </Link>
        </div>
      </div>
    );
  }

  const topBarHandle =
    isPlaceholderUsername || !data.profile.username?.trim()
      ? displayName
      : `@${data.profile.username.trim()}`;

  const profileLinkState = { backTo, backLabel };

  return (
    <div className={profileRootCn} data-profile-root>
      <div className={styles.igTopBar}>
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className={styles.igTopBarIconBtn}
          aria-label={backLabel}
          title={backLabel}
        >
          <LuChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
        </button>
        <span className={styles.igTopBarTitle}>{topBarHandle}</span>
        <div className={styles.igTopBarRight}>
          {isOwner ? (
            <Link to="/profile" className={styles.igTopBarIconBtn} aria-label="Настройки профиля" title="Настройки">
              <LuSettings className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          ) : (
            <span className={styles.igTopBarRightPad} aria-hidden />
          )}
        </div>
      </div>

      <header className={styles.igHeader}>
        <div className={styles.igHeaderInner}>
          <div className={styles.igProfileMainRow}>
            <div className={styles.igAvatarBlock}>
              <div className={styles.igAvatarRing}>
                <div className={styles.igAvatar}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" />
                  ) : (
                    <div className={styles.igAvatarPh}>
                      <LuUser className={styles.igAvatarPhIcon} strokeWidth={1.25} aria-hidden />
                    </div>
                  )}
                </div>
              </div>
              {isOwner ? (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.igHiddenFile}
                    disabled={avatarBusy}
                    onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className={styles.igAvatarCam}
                    aria-label="Сменить фото профиля"
                    disabled={avatarBusy}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <LuCamera className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                </>
              ) : null}
            </div>

            <div className={styles.igProfileRight}>
              <h1 className={styles.igDisplayNameTitle}>{displayName}</h1>
              {headerHandleLine ? <p className={styles.igHandleSub}>{headerHandleLine}</p> : null}

              <div className={styles.igStatColumns} role="group" aria-label="Статистика профиля">
                <div className={styles.igStatCell}>
                  <span className={styles.igStatCellNum}>{posts.length}</span>
                  <span className={styles.igStatCellLabel}>{postsLabel}</span>
                </div>
                <div className={styles.igStatCellMuted}>
                  <span className={styles.igStatCellNum}>0</span>
                  <span className={styles.igStatCellLabel}>подписчики</span>
                </div>
                <div className={styles.igStatCellMuted}>
                  <span className={styles.igStatCellNum}>0</span>
                  <span className={styles.igStatCellLabel}>подписки</span>
                </div>
              </div>

              {data.profile.is_private ? (
                <p className={styles.igPrivacyInline}>
                  <span className={styles.igPrivacyDot} aria-hidden />
                  Закрытый профиль
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.igBioSection}>
            <div className={styles.igBioBlock}>
              {data.profile.bio?.trim() ? (
                <p className={styles.igBioText}>{data.profile.bio.trim()}</p>
              ) : (
                <p className={styles.igBioEmpty}>
                  {isOwner ? (
                    <>
                      Расскажите о себе в{' '}
                      <Link to="/profile" className={styles.igInlineLink}>
                        настройках профиля
                      </Link>
                      .
                    </>
                  ) : (
                    'Пользователь пока ничего не написал.'
                  )}
                </p>
              )}
            </div>
          </div>

          {isOwner ? (
            <div className={styles.igPrimaryActions}>
              <Link to="/profile" className={styles.igBtnEditProfile}>
                Редактировать профиль
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.igFeedSection}>
        <div className={styles.igTabs}>
          <h2 className={styles.igFeedHeading}>
            <span className={styles.igTabActive}>
              <LuLayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              Публикации
            </span>
          </h2>
        </div>

        <main className={styles.fbFeed}>
          {data.profile.is_private && !isOwner ? (
            <div className={styles.igEmpty}>Этот профиль закрыт. Публикации доступны только владельцу.</div>
          ) : posts.length === 0 ? (
            <div className={styles.igEmpty}>
              <p>Пока нет публикаций.</p>
              {isOwner ? (
                <button type="button" className={styles.igEmptyCta} onClick={() => setComposeOpen(true)}>
                  <LuPlus className="h-5 w-5" aria-hidden />
                  Создать первую публикацию
                </button>
              ) : null}
            </div>
          ) : (
            posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                fallbackAuthor={fallbackAuthor}
                canInteract={Boolean(me)}
                isOwner={isOwner}
                likeBusy={!!postBusy[`like-${post.id}`]}
                repostBusy={!!postBusy[`repost-${post.id}`]}
                deleteBusy={!!postBusy[`del-${post.id}`]}
                profileLinkState={profileLinkState}
                onToggleLike={(p) => void onToggleLike(p)}
                onRepost={(p) => void onRepost(p)}
                onOpenComments={(p) => {
                  const uname = data?.profile.username?.trim() ?? '';
                  const authorName =
                    (uname && !/^member-\d+$/i.test(uname) ? uname : null) ||
                    displayName ||
                    null;
                  setCommentTarget({ postId: p.id, authorName });
                }}
                onEdit={(p) => setEditPost(p as ProfileFeedPost)}
                onDelete={(p) => void onDeletePost(p)}
              />
            ))
          )}
        </main>
      </div>

      {isOwner ? (
        <button
          type="button"
          className={styles.igFab}
          aria-label="Новая публикация"
          onClick={() => setComposeOpen(true)}
        >
          <LuPlus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}

      <ProfileComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPublished={() => void load()}
      />

      <EditPostModal
        open={editPost != null}
        post={editPost}
        onClose={() => setEditPost(null)}
        onSaved={(postId, caption) => patchPost(postId, { caption })}
      />

      <CommentSheet
        open={commentTarget != null}
        postId={commentTarget?.postId ?? null}
        postAuthorName={commentTarget?.authorName}
        myMemberId={me?.id ?? null}
        myAuthor={myAuthor}
        isAdmin={isAdmin}
        profileLinkState={profileLinkState}
        onClose={() => setCommentTarget(null)}
        onCountChange={(postId, delta) => {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              posts: prev.posts.map((p) =>
                p.id === postId
                  ? { ...p, comment_count: Math.max(0, (p.comment_count ?? 0) + delta) }
                  : p,
              ),
            };
          });
        }}
      />
    </div>
  );
}
