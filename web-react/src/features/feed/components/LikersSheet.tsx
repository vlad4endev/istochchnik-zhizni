import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuHeart, LuUser, LuX } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import { fetchPostLikers, type PostLiker } from '../feedApi';

import styles from './LikersSheet.module.css';

function likerName(l: PostLiker): string {
  const uname = (l.username ?? '').trim();
  if (uname && !/^member-\d+$/i.test(uname)) return uname;
  return (
    memberNameFirstLast(l) ||
    l.display_name?.trim() ||
    `Участник #${l.member_id}`
  );
}

function likerSubtitle(l: PostLiker): string | null {
  const uname = (l.username ?? '').trim();
  const isPlaceholder = !uname || /^member-\d+$/i.test(uname);
  const full = memberNameFirstLast(l) || l.display_name?.trim() || '';
  if (!isPlaceholder && full && full !== uname) return full;
  return null;
}

export type LikersSheetProps = {
  open: boolean;
  postId: string | null;
  profileLinkState?: { backTo?: string; backLabel?: string };
  onClose: () => void;
};

export function LikersSheet({ open, postId, profileLinkState, onClose }: LikersSheetProps) {
  const titleId = useId();
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    setLikers([]);
    setCursor(null);
    try {
      const page = await fetchPostLikers(postId, { limit: 40 });
      setLikers(page.likers);
      setTotal(page.total);
      setCursor(page.next_cursor);
    } catch {
      setError('Не удалось загрузить список');
      setLikers([]);
      setTotal(0);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!open || !postId) return;
    void loadFirst();
  }, [open, postId, loadFirst]);

  useEffect(() => {
    if (!open) return;
    const main = document.getElementById('main-content') as HTMLElement | null;
    const prevBody = document.body.style.overflow;
    const prevMain = main?.style.overflow ?? '';
    document.body.style.overflow = 'hidden';
    if (main) main.style.overflow = 'hidden';
    document.body.classList.add('feed-comments-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevBody;
      if (main) main.style.overflow = prevMain;
      document.body.classList.remove('feed-comments-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const loadMore = async () => {
    if (!postId || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPostLikers(postId, { cursor, limit: 40 });
      setLikers((prev) => {
        const seen = new Set(prev.map((x) => x.member_id));
        return [...prev, ...page.likers.filter((x) => !seen.has(x.member_id))];
      });
      setTotal(page.total);
      setCursor(page.next_cursor);
    } catch {
      /* keep list */
    } finally {
      setLoadingMore(false);
    }
  };

  if (!open || !postId) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.handle} aria-hidden />
        <div className={styles.head}>
          <button type="button" className={styles.closeBtn} aria-label="Закрыть" onClick={onClose}>
            <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <h2 id={titleId} className={styles.title}>
            Отметки «Нравится»
          </h2>
          <span className={styles.headSpacer} aria-hidden />
        </div>

        <div className={styles.list}>
          {loading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.skelRow} aria-hidden>
                  <div className={styles.skelAvatar} />
                  <div className={styles.skelLines}>
                    <div className={styles.skelLine} />
                    <div className={`${styles.skelLine} ${styles.skelLineShort}`} />
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {!loading && error ? (
            <div className={styles.stateBox}>
              <p className={styles.stateTitle}>{error}</p>
              <button type="button" className={styles.retryBtn} onClick={() => void loadFirst()}>
                Повторить
              </button>
            </div>
          ) : null}

          {!loading && !error && likers.length === 0 ? (
            <div className={styles.stateBox}>
              <LuHeart className={styles.emptyIcon} strokeWidth={1.75} aria-hidden />
              <p className={styles.stateTitle}>Пока нет отметок</p>
              <p className={styles.stateHint}>Будьте первым, кто поставит «Нравится»</p>
            </div>
          ) : null}

          {!loading && !error
            ? likers.map((l) => {
                const av = resolvePublicUrl(l.avatar_url);
                const name = likerName(l);
                const sub = likerSubtitle(l);
                const uname = (l.username ?? '').trim();
                const profileTo = uname
                  ? `/profile/${encodeURIComponent(uname)}`
                  : null;
                const rowInner = (
                  <>
                    <span className={styles.avatar}>
                      {av ? (
                        <img src={av} alt="" />
                      ) : (
                        <LuUser className="h-5 w-5 opacity-40" aria-hidden />
                      )}
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.name}>{name}</span>
                      {sub ? <span className={styles.sub}>{sub}</span> : null}
                    </span>
                    <LuHeart className={styles.heart} fill="currentColor" strokeWidth={0} aria-hidden />
                  </>
                );
                return profileTo ? (
                  <Link
                    key={l.member_id}
                    to={profileTo}
                    state={profileLinkState}
                    className={styles.row}
                    onClick={onClose}
                  >
                    {rowInner}
                  </Link>
                ) : (
                  <div key={l.member_id} className={styles.row}>
                    {rowInner}
                  </div>
                );
              })
            : null}

          {!loading && !error && cursor ? (
            <button
              type="button"
              className={styles.loadMore}
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Загрузка…' : 'Показать ещё'}
            </button>
          ) : null}

          {!loading && !error && total > 0 ? (
            <p className={styles.totalHint}>
              Всего: {total}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
