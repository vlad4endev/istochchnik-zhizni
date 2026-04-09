import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LuCamera,
  LuHeart,
  LuLayoutGrid,
  LuMessageCircle,
  LuPlus,
  LuSettings,
  LuUser,
} from 'react-icons/lu';

import { fetchMe, uploadMyAvatar, type MeResponse } from '../api';
import { fetchProfileByUsername, type ProfileFeedResponse } from '../publicProfileApi';
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

function formatMeName(me: MeResponse): string {
  const a = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim();
  if (a) return a;
  return me.name?.trim() || '';
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

  const avatarSrc = useMemo(() => {
    if (!data) return null;
    const u = data.profile.avatar_url ?? null;
    return resolvePublicUrl(u);
  }, [data]);

  const onPickAvatar = async (file: File | null) => {
    if (!file || !isOwner) return;
    setAvatarBusy(true);
    try {
      const next = await uploadMyAvatar(file);
      setMe(next);
      await load();
    } catch {
      /* ignore — можно добавить toast */
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
        <div className={styles.igGridWrap}>
          <div className={styles.igGrid} aria-busy="true" aria-label="Загрузка постов">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={styles.igSkelCell} />
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
                <h1 className={styles.igHandle}>@{data.profile.username}</h1>
                <div className={styles.igActions}>
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        className={styles.igBtnSecondary}
                        onClick={() => setComposeOpen(true)}
                      >
                        <LuPlus className="h-4 w-4" aria-hidden />
                        Создать
                      </button>
                      <Link to="/profile" className={styles.igBtnSecondary}>
                        <LuSettings className="h-4 w-4" aria-hidden />
                        Изменить
                      </Link>
                    </>
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
                <p className={styles.igDisplayName}>{displayName}</p>
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

      <div className={styles.igGridWrap}>
        <div className={styles.igGrid}>
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
              const url = firstMediaUrl(post);
              const kind = firstMediaType(post);
              return (
                <div key={post.id} className={styles.igCell}>
                  {url && kind === 'video' ? (
                    <video src={url} muted playsInline preload="metadata" />
                  ) : url ? (
                    <img src={url} alt="" loading="lazy" />
                  ) : (
                    <div className={styles.igCellFallback}>Нет медиа</div>
                  )}
                  <div className={styles.igCellOverlay}>
                    <div className={styles.igCellStats}>
                      <span>
                        <LuHeart className="inline h-4 w-4" strokeWidth={2} aria-hidden />
                        {post.like_count}
                      </span>
                      <span>
                        <LuMessageCircle className="inline h-4 w-4" strokeWidth={2} aria-hidden />
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
