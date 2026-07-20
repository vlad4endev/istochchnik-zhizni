import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  LuEllipsis,
  LuHeart,
  LuMessageCircle,
  LuPencil,
  LuRepeat2,
  LuTrash2,
  LuUser,
} from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import type {
  ProfileFeedPost,
  ProfileFeedPostAuthor,
  ProfileFeedPostEmbedded,
} from '../../profile/publicProfileApi';
import type { FeedPost } from '../feedApi';

import styles from './FeedPostCard.module.css';

export type FeedCardPost = (FeedPost | ProfileFeedPost) & {
  author?: ProfileFeedPostAuthor;
};

function sortMedia(post: Pick<FeedCardPost, 'media'>): FeedCardPost['media'] {
  return [...post.media].sort((a, b) => a.order - b.order);
}

export function formatPostDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = Date.now();
    const diffMin = Math.floor((now - d.getTime()) / 60_000);
    if (diffMin < 1) return 'сейчас';
    if (diffMin < 60) return `${diffMin} мин`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} д`;
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

function authorDisplayName(author: ProfileFeedPostAuthor): string {
  const uname = (author.username ?? '').trim();
  const isPlaceholderUsername = /^member-\d+$/i.test(uname);
  return (
    memberNameFirstLast(author) ||
    author.display_name?.trim() ||
    (!isPlaceholderUsername && uname ? `@${uname}` : `Участник #${author.member_id}`)
  );
}

function ProfilePostMediaBlock({
  post,
  onSlideChange,
}: {
  post: Pick<FeedCardPost, 'media'>;
  onSlideChange?: (index: number) => void;
}) {
  const items = sortMedia(post);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  if (items.length === 0) return null;
  const multi = items.length > 1;

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || !onSlideChange || !multi) return;
    const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    onSlideChange(Math.min(Math.max(idx, 0), items.length - 1));
  };

  return (
    <div
      ref={scrollerRef}
      className={`${styles.media} ${multi ? styles.mediaCarousel : ''}`}
      onScroll={multi ? onScroll : undefined}
    >
      {items.map((m, idx) => {
        const url = resolvePublicUrl(m.url) ?? '';
        if (!url) return null;
        if (m.type === 'video') {
          return (
            <video
              key={`${m.url}-${idx}`}
              className={styles.mediaItem}
              src={url}
              controls
              playsInline
              preload="metadata"
            />
          );
        }
        return (
          <img key={`${m.url}-${idx}`} className={styles.mediaItem} src={url} alt="" loading="lazy" />
        );
      })}
    </div>
  );
}

function EmbeddedPostCard({
  embed,
  profileLinkState,
}: {
  embed: ProfileFeedPostEmbedded;
  profileLinkState?: { backTo?: string; backLabel?: string };
}) {
  const av = resolvePublicUrl(embed.author.avatar_url) ?? undefined;
  const name = authorDisplayName(embed.author);
  const uname = (embed.author.username ?? '').trim();
  return (
    <div className={styles.embed}>
      <div className={styles.embedHead}>
        {uname ? (
          <Link
            to={`/profile/${encodeURIComponent(uname)}`}
            state={profileLinkState}
            className={styles.embedAvatar}
          >
            {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1 opacity-40" aria-hidden />}
          </Link>
        ) : (
          <div className={styles.embedAvatar}>
            {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1 opacity-40" aria-hidden />}
          </div>
        )}
        {uname ? (
          <Link
            to={`/profile/${encodeURIComponent(uname)}`}
            state={profileLinkState}
            className={styles.embedWho}
          >
            {name}
          </Link>
        ) : (
          <span className={styles.embedWho}>{name}</span>
        )}
      </div>
      {embed.caption?.trim() ? <p className={styles.embedCaption}>{embed.caption.trim()}</p> : null}
      <ProfilePostMediaBlock post={embed} />
    </div>
  );
}

const SPARKS = [
  { x: -42, y: -28, delay: 0 },
  { x: 38, y: -34, delay: 0.02 },
  { x: -28, y: 36, delay: 0.04 },
  { x: 44, y: 22, delay: 0.03 },
  { x: 0, y: -48, delay: 0.01 },
  { x: -50, y: 8, delay: 0.05 },
];

export type FeedPostCardProps = {
  post: FeedCardPost;
  /** Автор ленты (для профиля без author на посте — владелец страницы). */
  fallbackAuthor?: ProfileFeedPostAuthor;
  canInteract: boolean;
  isOwner?: boolean;
  likeBusy?: boolean;
  repostBusy?: boolean;
  deleteBusy?: boolean;
  profileLinkState?: { backTo?: string; backLabel?: string };
  /** Индекс для лёгкого stagger при первом появлении. */
  appearIndex?: number;
  onToggleLike: (post: FeedCardPost) => void;
  onRepost: (post: FeedCardPost) => void;
  onOpenComments: (post: FeedCardPost) => void;
  /** Открыть список «кто лайкнул» (как в Instagram). */
  onOpenLikers?: (post: FeedCardPost) => void;
  onEdit?: (post: FeedCardPost) => void;
  onDelete?: (post: FeedCardPost) => void;
};

export function FeedPostCard({
  post,
  fallbackAuthor,
  canInteract,
  isOwner,
  likeBusy,
  repostBusy,
  deleteBusy,
  profileLinkState,
  appearIndex = 0,
  onToggleLike,
  onRepost,
  onOpenComments,
  onOpenLikers,
  onEdit,
  onDelete,
}: FeedPostCardProps) {
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [burst, setBurst] = useState(false);
  const [likePop, setLikePop] = useState(false);
  const [countBump, setCountBump] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef(0);
  const likedRef = useRef(post.liked_by_me ?? false);

  const author = post.author ?? fallbackAuthor ?? null;
  const liked = post.liked_by_me ?? false;
  const reposted = post.reposted_by_me ?? false;
  const av = author ? resolvePublicUrl(author.avatar_url) : null;
  const uname = author?.username?.trim() ?? '';
  const name = author ? authorDisplayName(author) : '';
  const mediaCount = sortMedia(post).length;

  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const playLikeFx = () => {
    if (reduceMotion) return;
    setLikePop(true);
    setCountBump(true);
    setBurst(true);
    window.setTimeout(() => setLikePop(false), 560);
    window.setTimeout(() => setCountBump(false), 360);
    window.setTimeout(() => setBurst(false), 720);
  };

  const likePost = () => {
    if (!canInteract || likeBusy) return;
    if (!likedRef.current) playLikeFx();
    onToggleLike(post);
  };

  const onMediaDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320 && canInteract && !likedRef.current) {
      playLikeFx();
      onToggleLike(post);
    }
    lastTapRef.current = now;
  };

  const showOwnerMenu = Boolean(isOwner && (onEdit || onDelete));
  const staggerDelay = Math.min(appearIndex, 8) * 0.04;

  return (
    <motion.article
      className={styles.card}
      initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-6% 0px -8% 0px', amount: 0.2 }}
      transition={{
        duration: 0.48,
        delay: staggerDelay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className={styles.head}>
        <div className={`${styles.headRow} ${showOwnerMenu ? styles.headRowWithMenu : ''}`}>
          {author && uname ? (
            <Link
              to={`/profile/${encodeURIComponent(uname)}`}
              state={profileLinkState}
              className={styles.avatar}
              aria-label={name}
            >
              {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-2 opacity-40" aria-hidden />}
            </Link>
          ) : author ? (
            <div className={styles.avatar}>
              {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-2 opacity-40" aria-hidden />}
            </div>
          ) : null}

          <div className={styles.authorMeta}>
            <div className={styles.authorLine}>
              {author && uname ? (
                <Link
                  to={`/profile/${encodeURIComponent(uname)}`}
                  state={profileLinkState}
                  className={styles.authorName}
                >
                  {name}
                </Link>
              ) : author ? (
                <span className={styles.authorName}>{name}</span>
              ) : post.shared_post ? (
                <p className={styles.repostBadge}>
                  <LuRepeat2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Репост
                </p>
              ) : (
                <span className={styles.headSpacer} aria-hidden />
              )}
              <time className={styles.time} dateTime={post.created_at}>
                {formatPostDate(post.created_at)}
              </time>
            </div>
            {post.shared_post && author ? (
              <p className={styles.repostBadge}>
                <LuRepeat2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Репост
              </p>
            ) : null}
          </div>

          {showOwnerMenu ? (
            <div className={styles.menuInline} ref={menuOpen ? menuRef : undefined}>
              <button
                type="button"
                className={styles.menuBtn}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Действия с публикацией"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                <LuEllipsis className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </button>
              {menuOpen ? (
                <div className={styles.menu} role="menu">
                  {onEdit ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        onEdit(post);
                        setMenuOpen(false);
                      }}
                    >
                      <LuPencil className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      Редактировать
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItemDanger}
                      disabled={deleteBusy}
                      onClick={() => {
                        onDelete(post);
                        setMenuOpen(false);
                      }}
                    >
                      <LuTrash2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      Удалить
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {post.caption?.trim() ? <p className={styles.caption}>{post.caption.trim()}</p> : null}

      <div className={styles.mediaWrap} onClick={onMediaDoubleTap} role="presentation">
        {post.shared_post ? (
          <EmbeddedPostCard embed={post.shared_post} profileLinkState={profileLinkState} />
        ) : (
          <ProfilePostMediaBlock post={post} onSlideChange={setSlide} />
        )}

        {!post.shared_post && mediaCount > 1 ? (
          <div className={styles.dots} aria-hidden>
            {Array.from({ length: mediaCount }).map((_, i) => (
              <span key={i} className={`${styles.dot} ${i === slide ? styles.dotActive : ''}`} />
            ))}
          </div>
        ) : null}

        <AnimatePresence>
          {burst ? (
            <motion.div
              className={styles.heartBurst}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                initial={{ scale: 0.2, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 1.35, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
              >
                <LuHeart className={styles.heartBurstIcon} fill="currentColor" strokeWidth={0} aria-hidden />
              </motion.div>
              {SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className={styles.spark}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 0], x: s.x, y: s.y, scale: [0.4, 1, 0.2] }}
                  transition={{ duration: 0.55, delay: s.delay, ease: 'easeOut' }}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className={styles.actions}>
        <div className={`${styles.likeGroup} ${liked ? styles.actionBtnActive : ''}`}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.likeHeartBtn}`}
            disabled={!canInteract || likeBusy}
            onClick={likePost}
            aria-pressed={liked}
            aria-label={liked ? 'Убрать отметку «Нравится»' : 'Нравится'}
          >
            <span className={`${styles.likeIcon} ${likePop ? styles.likeIconPop : ''}`}>
              <LuHeart
                className="h-4 w-4"
                strokeWidth={liked ? 2.5 : 2}
                fill={liked ? 'currentColor' : 'none'}
                aria-hidden
              />
            </span>
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.likeCountBtn}`}
            disabled={!canInteract || !onOpenLikers || (post.like_count ?? 0) <= 0}
            onClick={() => onOpenLikers?.(post)}
            aria-label={`Кто поставил «Нравится»: ${post.like_count ?? 0}`}
            title={(post.like_count ?? 0) > 0 ? 'Кто поставил «Нравится»' : undefined}
          >
            <span className={countBump ? styles.countBump : undefined}>{post.like_count ?? 0}</span>
          </button>
        </div>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!canInteract || repostBusy || reposted}
          onClick={() => onRepost(post)}
          title={reposted ? 'Уже в вашей ленте' : 'Поделиться у себя'}
        >
          <LuRepeat2 className="h-4 w-4" aria-hidden />
          {post.repost_count ?? 0}
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!canInteract}
          onClick={() => onOpenComments(post)}
        >
          <LuMessageCircle className="h-4 w-4" aria-hidden />
          {post.comment_count ?? 0}
        </button>
      </div>
    </motion.article>
  );
}
