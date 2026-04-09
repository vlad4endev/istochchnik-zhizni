import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuHeart, LuMessageCircle, LuUser } from 'react-icons/lu';

import { fetchMe, type MeResponse } from '../api';
import { fetchProfileByUsername, type ProfileFeedResponse } from '../publicProfileApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

import profileShell from '../profileShell.module.css';
import styles from './PublicProfilePage.module.css';

const profileRootCn = `${profileShell.profileRoot} ${styles.psPage}`;

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string') return data.error;
  }
  return 'Не удалось загрузить профиль';
}

function firstMediaUrl(post: ProfileFeedResponse['posts'][0]): string | null {
  const sorted = [...post.media].sort((a, b) => a.order - b.order);
  const m = sorted[0];
  return m ? resolvePublicUrl(m.url) : null;
}

function firstMediaType(post: ProfileFeedResponse['posts'][0]): 'image' | 'video' {
  const sorted = [...post.media].sort((a, b) => a.order - b.order);
  const m = sorted[0];
  return m?.type === 'video' ? 'video' : 'image';
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const decoded = username ? decodeURIComponent(username) : '';

  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<ProfileFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const displayName =
    data?.profile.display_name?.trim() || data?.profile.username || decoded;
  const avatarSrc = resolvePublicUrl(data?.profile.avatar_url ?? null);

  if (loading) {
    return (
      <div className={profileRootCn} data-profile-root>
        <div className={styles.psHeader}>
          <div className={styles.psHeaderInner}>
            <div className={styles.psSkelHeader}>
              <div className={styles.psSkelAvatar} aria-hidden />
              <div className={styles.psSkelLines}>
                <div className={`${styles.psSkelLine} ${styles.psSkelLineLong}`} />
                <div className={`${styles.psSkelLine} ${styles.psSkelLineShort}`} />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.psGridWrap}>
          <div className={styles.psGrid} aria-busy="true" aria-label="Загрузка постов">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={styles.psSkelCell} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={profileRootCn} data-profile-root>
        <div className={styles.psError}>
          <p>{error ?? 'Профиль не найден'}</p>
          <Link
            to="/dashboard"
            className="mt-4 inline-block text-sm font-bold text-[color:var(--profile-primary)] underline-offset-2 hover:underline"
          >
            На главную
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={profileRootCn} data-profile-root>
      <div className={styles.psHeader}>
        <div className={styles.psHeaderInner}>
          <div className={styles.psRow}>
            <div className={styles.psAvatar}>
              {avatarSrc ? (
                <img src={avatarSrc} alt="" />
              ) : (
                <div className={styles.psAvatarPlaceholder}>
                  <LuUser style={{ width: '2.5rem', height: '2.5rem' }} strokeWidth={1.4} aria-hidden />
                </div>
              )}
            </div>
            <div className={styles.psTextCol}>
              <h1 className={styles.psTitle}>{displayName}</h1>
              <p className={styles.psUsername}>@{data.profile.username}</p>
              {data.profile.bio?.trim() ? <p className={styles.psBio}>{data.profile.bio.trim()}</p> : null}
              <div className={styles.psMeta}>
                <span className={styles.psBadge}>{posts.length} публикаций</span>
                {data.profile.is_private ? <span className={styles.psBadge}>Закрытый профиль</span> : null}
                {isOwner ? (
                  <Link to="/profile" className={styles.psBadge} style={{ textDecoration: 'none', color: 'inherit' }}>
                    Мои настройки
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.psGridWrap}>
        <div className={styles.psGrid}>
          {data.profile.is_private && !isOwner ? (
            <div className={styles.psEmpty}>Этот профиль закрыт. Публикации доступны только владельцу.</div>
          ) : posts.length === 0 ? (
            <div className={styles.psEmpty}>Пока нет публикаций.</div>
          ) : (
            posts.map((post) => {
              const url = firstMediaUrl(post);
              const kind = firstMediaType(post);
              return (
                <div key={post.id} className={styles.psCell}>
                  {url && kind === 'video' ? (
                    <video src={url} muted playsInline preload="metadata" />
                  ) : url ? (
                    <img src={url} alt="" loading="lazy" />
                  ) : (
                    <div className={styles.psEmpty} style={{ padding: '1rem', fontSize: '0.7rem' }}>
                      Нет медиа
                    </div>
                  )}
                  <div className={styles.psCellOverlay}>
                    <div className={styles.psCellStats}>
                      <span>
                        <LuHeart className="inline" style={{ marginRight: 4, verticalAlign: 'middle' }} aria-hidden />
                        {post.like_count}
                      </span>
                      <span>
                        <LuMessageCircle
                          className="inline"
                          style={{ marginRight: 4, verticalAlign: 'middle' }}
                          aria-hidden
                        />
                        {post.comment_count}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
