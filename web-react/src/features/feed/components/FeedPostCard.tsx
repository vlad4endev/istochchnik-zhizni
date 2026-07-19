import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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

import styles from '../../profile/pages/PublicProfilePage.module.css';

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

function authorDisplayName(author: ProfileFeedPostAuthor): string {
  const uname = (author.username ?? '').trim();
  const isPlaceholderUsername = /^member-\d+$/i.test(uname);
  return (
    memberNameFirstLast(author) ||
    author.display_name?.trim() ||
    (!isPlaceholderUsername && uname ? `@${uname}` : `Участник #${author.member_id}`)
  );
}

function ProfilePostMediaBlock({ post }: { post: Pick<FeedCardPost, 'media'> }) {
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
    <div className={styles.fbEmbed}>
      <div className={styles.fbEmbedHead}>
        {uname ? (
          <Link
            to={`/profile/${encodeURIComponent(uname)}`}
            state={profileLinkState}
            className={styles.fbEmbedAvatar}
          >
            {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1 opacity-40" aria-hidden />}
          </Link>
        ) : (
          <div className={styles.fbEmbedAvatar}>
            {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1 opacity-40" aria-hidden />}
          </div>
        )}
        {uname ? (
          <Link
            to={`/profile/${encodeURIComponent(uname)}`}
            state={profileLinkState}
            className={styles.fbEmbedWho}
            style={{ textDecoration: 'none' }}
          >
            {name}
          </Link>
        ) : (
          <span className={styles.fbEmbedWho}>{name}</span>
        )}
      </div>
      {embed.caption?.trim() ? <p className={styles.fbEmbedCaption}>{embed.caption.trim()}</p> : null}
      <ProfilePostMediaBlock post={embed} />
    </div>
  );
}

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
  onToggleLike: (post: FeedCardPost) => void;
  onRepost: (post: FeedCardPost) => void;
  onOpenComments: (post: FeedCardPost) => void;
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
  onToggleLike,
  onRepost,
  onOpenComments,
  onEdit,
  onDelete,
}: FeedPostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef(0);

  const author = post.author ?? fallbackAuthor ?? null;
  const liked = post.liked_by_me ?? false;
  const reposted = post.reposted_by_me ?? false;
  const av = author ? resolvePublicUrl(author.avatar_url) : null;
  const uname = author?.username?.trim() ?? '';
  const name = author ? authorDisplayName(author) : '';

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const onMediaDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320 && canInteract && !liked) {
      onToggleLike(post);
    }
    lastTapRef.current = now;
  };

  return (
    <article className={styles.fbCard}>
      <div className={styles.fbCardHead}>
        {isOwner && (onEdit || onDelete) ? (
          <div className={styles.fbCardMenuAnchor} ref={menuOpen ? menuRef : undefined}>
            <button
              type="button"
              className={styles.fbCardMenuBtn}
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
              <div className={styles.fbCardMenu} role="menu">
                {onEdit ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.fbCardMenuItem}
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
                    className={styles.fbCardMenuItemDanger}
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

        <div className={styles.fbCardHeadRow}>
          {author && uname ? (
            <Link
              to={`/profile/${encodeURIComponent(uname)}`}
              state={profileLinkState}
              className={styles.fbCardAvatar}
              aria-label={name}
            >
              {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-2 opacity-40" aria-hidden />}
            </Link>
          ) : author ? (
            <div className={styles.fbCardAvatar}>
              {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-2 opacity-40" aria-hidden />}
            </div>
          ) : null}

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            {author && uname ? (
              <Link
                to={`/profile/${encodeURIComponent(uname)}`}
                state={profileLinkState}
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 800,
                  color: 'var(--profile-text-heading)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </Link>
            ) : author ? (
              <span
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 800,
                  color: 'var(--profile-text-heading)',
                }}
              >
                {name}
              </span>
            ) : post.shared_post ? (
              <p className={styles.fbRepostBadge}>
                <LuRepeat2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Репост
              </p>
            ) : (
              <span className={styles.fbCardHeadSpacer} aria-hidden />
            )}
            {post.shared_post && author ? (
              <p className={styles.fbRepostBadge} style={{ alignSelf: 'flex-start' }}>
                <LuRepeat2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Репост
              </p>
            ) : null}
          </div>

          <time className={styles.fbCardTime} dateTime={post.created_at}>
            {formatPostDate(post.created_at)}
          </time>
        </div>
      </div>

      {post.caption?.trim() ? <p className={styles.fbCaption}>{post.caption.trim()}</p> : null}

      <div onClick={onMediaDoubleTap} role="presentation">
        {post.shared_post ? (
          <EmbeddedPostCard embed={post.shared_post} profileLinkState={profileLinkState} />
        ) : (
          <ProfilePostMediaBlock post={post} />
        )}
      </div>

      <div className={styles.fbActions}>
        <button
          type="button"
          className={`${styles.fbActionBtn} ${liked ? styles.fbActionBtnActive : ''}`}
          disabled={!canInteract || likeBusy}
          onClick={() => onToggleLike(post)}
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
          disabled={!canInteract || repostBusy || reposted}
          onClick={() => onRepost(post)}
          title={reposted ? 'Уже в вашей ленте' : 'Поделиться у себя'}
        >
          <LuRepeat2 className="h-4 w-4" aria-hidden />
          {post.repost_count ?? 0}
        </button>
        <button
          type="button"
          className={styles.fbActionBtn}
          disabled={!canInteract}
          onClick={() => onOpenComments(post)}
        >
          <LuMessageCircle className="h-4 w-4" aria-hidden />
          {post.comment_count ?? 0}
        </button>
      </div>
    </article>
  );
}
