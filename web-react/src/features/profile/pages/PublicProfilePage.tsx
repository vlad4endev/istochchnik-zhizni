import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LuCamera,
  LuHeart,
  LuLayoutGrid,
  LuMessageCircle,
  LuPlus,
  LuRepeat2,
  LuUser,
} from 'react-icons/lu';

import { fetchMe, uploadMyAvatar, type MeResponse } from '../api';
import {
  fetchProfileByUsername,
  likeProfilePost,
  repostProfilePost,
  type ProfileFeedPost,
  type ProfileFeedPostEmbedded,
  type ProfileFeedResponse,
  unlikeProfilePost,
} from '../publicProfileApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { ProfileComposeModal } from '../components/ProfileComposeModal';

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

function formatMeName(me: MeResponse): string {
  const a = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim();
  if (a) return a;
  return me.name?.trim() || '';
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
  const decoded = username ? decodeURIComponent(username) : '';

  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<ProfileFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
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

  const displayName = useMemo(() => {
    if (!data) return decoded;
    const fromProfile = data.profile.display_name?.trim();
    if (fromProfile) return fromProfile;
    if (isOwner && me) {
      const n = formatMeName(me);
      if (n) return n;
    }
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
        <div className={styles.fbFeed}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.fbSkelCard} aria-hidden />
          ))}
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

  return (
    <div className={profileRootCn} data-profile-root>
      <header className={styles.igHeader}>
        <div className={styles.igHeaderInner}>
          <div className={styles.igHero}>
            <div className={styles.igAvatarBlock}>
              <div className={styles.igAvatar}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" />
                ) : (
                  <div className={styles.igAvatarPh}>
                    <LuUser className={styles.igAvatarPhIcon} strokeWidth={1.25} aria-hidden />
                  </div>
                )}
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

            <div className={styles.igHeroMain}>
              <div className={styles.igNameRow}>
                <div className={styles.igTitleBlock}>
                  <h1 className={styles.igHandle}>{displayName}</h1>
                  {headerHandleLine ? (
                    <p className={styles.igHandleSub}>{headerHandleLine}</p>
                  ) : null}
                </div>
              </div>

              <div className={styles.igStats}>
                <div className={styles.igStat}>
                  <span className={styles.igStatNum}>{posts.length}</span>
                  <span className={styles.igStatLabel}>публикаций</span>
                </div>
                {data.profile.is_private ? (
                  <span className={styles.igLock}>Закрытый профиль</span>
                ) : null}
              </div>

              <div className={styles.igDisplayBlock}>
                <div className={styles.igBioBlock}>
                  <span className={styles.igBioLabel}>О себе</span>
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
            </div>
          </div>
        </div>
      </header>

      <div className={styles.igTabs}>
        <span className={styles.igTabActive}>
          <LuLayoutGrid className="h-4 w-4" aria-hidden />
          Публикации
        </span>
      </div>

      <div className={styles.fbFeed}>
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
                  <div className={styles.fbCardMeta}>
                    {post.shared_post ? (
                      <p className={styles.fbRepostBadge}>
                        <LuRepeat2 className="h-3.5 w-3.5" aria-hidden />
                        Поделился публикацией
                      </p>
                    ) : null}
                    <p className={styles.fbCardSub}>{formatPostDate(post.created_at)}</p>
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
    </div>
  );
}
