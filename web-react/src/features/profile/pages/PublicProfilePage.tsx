import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LuCamera,
  LuChevronLeft,
  LuEllipsis,
  LuHeart,
  LuLayoutGrid,
  LuMessageCircle,
  LuPencil,
  LuPlus,
  LuRepeat2,
  LuSettings,
  LuTrash2,
  LuUser,
} from 'react-icons/lu';

import { fetchMe, uploadMyAvatar, type MeResponse } from '../api';
import {
  deleteProfilePost,
  fetchProfileByUsername,
  likeProfilePost,
  repostProfilePost,
  type ProfileFeedPost,
  type ProfileFeedPostEmbedded,
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

function sortMedia(post: Pick<ProfileFeedPost, 'media'>): ProfileFeedPost['media'] {
  return [...post.media].sort((a, b) => a.order - b.order);
}

function formatPostDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function ProfilePostMediaBlock({ post }: { post: Pick<ProfileFeedPost, 'media'> }) {
  const items = sortMedia(post);
  if (items.length === 0) return null;
  return (
    <div className={styles.fbMedia}>
      {items.map((m, idx) => {
        const url = resolvePublicUrl(m.url) ?? '';
        if (!url) return null;
        if (m.type === 'video') {
          return (
            <video key={`${m.url}-${idx}`} src={url} controls playsInline preload="metadata" />
          );
        }
        return <img key={`${m.url}-${idx}`} src={url} alt="" loading="lazy" />;
      })}
    </div>
  );
}

function EmbeddedPostCard({ embed }: { embed: ProfileFeedPostEmbedded }) {
  const av = resolvePublicUrl(embed.author.avatar_url) ?? undefined;
  const uname = (embed.author.username ?? '').trim();
  const isPlaceholderUsername = /^member-\d+$/i.test(uname);
  const name =
    memberNameFirstLast(embed.author) ||
    embed.author.display_name?.trim() ||
    (!isPlaceholderUsername && uname ? `@${uname}` : `Участник #${embed.member_id}`);
  return (
    <div className={styles.fbEmbed}>
      <div className={styles.fbEmbedHead}>
        <div className={styles.fbEmbedAvatar}>
          {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1 opacity-40" aria-hidden />}
        </div>
        <span className={styles.fbEmbedWho}>{name}</span>
      </div>
      {embed.caption?.trim() ? <p className={styles.fbEmbedCaption}>{embed.caption.trim()}</p> : null}
      <ProfilePostMediaBlock post={embed} />
    </div>
  );
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
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [postBusy, setPostBusy] = useState<Record<string, string | undefined>>({});
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const postMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!postMenuId) return;
    const onDown = (e: MouseEvent) => {
      const el = postMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setPostMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [postMenuId]);

  const isOwner = me != null && data != null && me.id === data.profile.member_id;
  const postsVisible = data && (!data.profile.is_private || isOwner);
  const posts = postsVisible ? data.posts : [];
  const postsLabel = pluralizeRu(posts.length, ['публикация', 'публикации', 'публикаций']);

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

  /** Подпись @username под именем — только если это не дублирует заголовок. */
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
    const u = data.profile.avatar_url ?? null;
    return resolvePublicUrl(u);
  }, [data]);

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
    async (post: ProfileFeedPost) => {
      if (!window.confirm('Удалить эту публикацию? Действие необратимо.')) return;
      setPostMenuId(null);
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
    async (post: ProfileFeedPost) => {
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
    async (post: ProfileFeedPost) => {
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
    [me, patchPost, load],
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
          <Link to="/dashboard" className={styles.igErrorLink}>
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const topBarHandle =
    isPlaceholderUsername || !data.profile.username?.trim()
      ? displayName
      : `@${data.profile.username.trim()}`;

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
          posts.map((post) => {
            const liked = post.liked_by_me ?? false;
            const likeBusy = !!postBusy[`like-${post.id}`];
            const repostBusy = !!postBusy[`repost-${post.id}`];
            const reposted = post.reposted_by_me ?? false;
            return (
              <article key={post.id} className={styles.fbCard}>
                <div className={styles.fbCardHead}>
                  {isOwner ? (
                    <div
                      className={styles.fbCardMenuAnchor}
                      ref={postMenuId === post.id ? postMenuRef : undefined}
                    >
                      <button
                        type="button"
                        className={styles.fbCardMenuBtn}
                        aria-expanded={postMenuId === post.id}
                        aria-haspopup="menu"
                        aria-label="Действия с публикацией"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPostMenuId((id) => (id === post.id ? null : post.id));
                        }}
                      >
                        <LuEllipsis className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                      </button>
                      {postMenuId === post.id ? (
                        <div className={styles.fbCardMenu} role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.fbCardMenuItem}
                            onClick={() => {
                              setEditPost(post);
                              setPostMenuId(null);
                            }}
                          >
                            <LuPencil className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            Редактировать
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.fbCardMenuItemDanger}
                            disabled={!!postBusy[`del-${post.id}`]}
                            onClick={() => void onDeletePost(post)}
                          >
                            <LuTrash2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.fbCardHeadRow}>
                    {post.shared_post ? (
                      <p className={styles.fbRepostBadge}>
                        <LuRepeat2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Репост
                      </p>
                    ) : (
                      <span className={styles.fbCardHeadSpacer} aria-hidden />
                    )}
                    <time className={styles.fbCardTime} dateTime={post.created_at}>
                      {formatPostDate(post.created_at)}
                    </time>
                  </div>
                </div>
                {post.caption?.trim() ? <p className={styles.fbCaption}>{post.caption.trim()}</p> : null}
                {post.shared_post ? <EmbeddedPostCard embed={post.shared_post} /> : <ProfilePostMediaBlock post={post} />}
                <div className={styles.fbActions}>
                  <button
                    type="button"
                    className={`${styles.fbActionBtn} ${liked ? styles.fbActionBtnActive : ''}`}
                    disabled={!me || likeBusy}
                    onClick={() => void onToggleLike(post)}
                    aria-pressed={liked}
                  >
                    <LuHeart
                      className="h-4 w-4"
                      strokeWidth={liked ? 2.5 : 2}
                      fill={liked ? 'currentColor' : 'none'}
                      aria-hidden
                    />
                    {post.like_count ?? 0}
                  </button>
                  <button
                    type="button"
                    className={styles.fbActionBtn}
                    disabled={!me || repostBusy || reposted}
                    onClick={() => void onRepost(post)}
                    title={reposted ? 'Уже в вашей ленте' : 'Поделиться у себя'}
                  >
                    <LuRepeat2 className="h-4 w-4" aria-hidden />
                    {post.repost_count ?? 0}
                  </button>
                  <span className={`${styles.fbActionBtn}`} style={{ cursor: 'default' }}>
                    <LuMessageCircle className="h-4 w-4" aria-hidden />
                    {post.comment_count ?? 0}
                  </span>
                </div>
              </article>
            );
          })
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
    </div>
  );
}
