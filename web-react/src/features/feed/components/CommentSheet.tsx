import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuHeart, LuTrash2, LuUser, LuX } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import type { ProfileFeedPostAuthor } from '../../profile/publicProfileApi';
import {
  createPostComment,
  deletePostComment,
  fetchPostComments,
  likePostComment,
  unlikePostComment,
  type FeedComment,
} from '../feedApi';
import { formatPostDate } from './FeedPostCard';

import styles from './CommentSheet.module.css';

const COMMENT_MAX = 2000;
const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'] as const;

function commentHandle(c: FeedComment): string {
  if (!c.author) return 'участник';
  const uname = (c.author.username ?? '').trim();
  if (uname && !/^member-\d+$/i.test(uname)) return uname;
  return (
    memberNameFirstLast(c.author) ||
    c.author.display_name?.trim() ||
    `участник_${c.author.member_id}`
  );
}

function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
}

function prefersDesktopComposer(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export type CommentSheetProps = {
  open: boolean;
  postId: string | null;
  myMemberId: number | null;
  myAuthor?: ProfileFeedPostAuthor | null;
  /** Имя автора поста для плейсхолдера «Оставьте комментарий для …». */
  postAuthorName?: string | null;
  isAdmin?: boolean;
  profileLinkState?: { backTo?: string; backLabel?: string };
  onClose: () => void;
  onCountChange?: (postId: string, delta: number) => void;
};

export function CommentSheet({
  open,
  postId,
  myMemberId,
  myAuthor,
  postAuthorName,
  isAdmin,
  profileLinkState,
  onClose,
  onCountChange,
}: CommentSheetProps) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPostComments(postId);
      setComments(list);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data?.error ??
                'Не удалось загрузить комментарии',
            )
          : 'Не удалось загрузить комментарии';
      setError(msg);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!open || !postId) return;
    setText('');
    setSendError(null);
    void load();
  }, [open, postId, load]);

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

  useLayoutEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (prefersDesktopComposer()) {
        inputRef.current?.focus({ preventScroll: true });
      }
      autosizeTextarea(inputRef.current);
    }, 220);
    return () => window.clearTimeout(t);
  }, [open, postId]);

  useEffect(() => {
    if (!open) {
      setKeyboardInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInset(inset > 48 ? inset : 0);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [open]);

  useEffect(() => {
    if (!open || loading) return;
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [open, loading, comments.length, keyboardInset]);

  if (!open || !postId) return null;

  const myAv = resolvePublicUrl(myAuthor?.avatar_url ?? null);
  const nearLimit = text.length >= COMMENT_MAX - 80;
  const authorLabel = (postAuthorName ?? '').trim();
  const placeholder = authorLabel
    ? `Оставьте комментарий для ${authorLabel}…`
    : 'Оставьте комментарий…';

  const appendEmoji = (emoji: string) => {
    setText((prev) => {
      const next = `${prev}${emoji}`;
      return next.length > COMMENT_MAX ? prev : next;
    });
    requestAnimationFrame(() => {
      autosizeTextarea(inputRef.current);
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  const onReply = (c: FeedComment) => {
    const handle = commentHandle(c);
    const prefix = `@${handle} `;
    setText((prev) => (prev.startsWith(prefix) ? prev : `${prefix}${prev}`));
    requestAnimationFrame(() => {
      autosizeTextarea(inputRef.current);
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  const onSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await createPostComment(postId, trimmed);
      setComments((prev) => [
        ...prev,
        {
          id: created.id,
          post_id: postId,
          member_id: myMemberId,
          text: trimmed,
          created_at: created.created_at,
          author: myAuthor ?? null,
          like_count: 0,
          liked_by_me: false,
        },
      ]);
      setText('');
      onCountChange?.(postId, 1);
      requestAnimationFrame(() => autosizeTextarea(inputRef.current));
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data?.error ??
                'Не удалось отправить',
            )
          : 'Не удалось отправить';
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  const onToggleLike = async (c: FeedComment) => {
    if (likingId === c.id) return;
    setLikingId(c.id);
    const liked = Boolean(c.liked_by_me);
    const prevCount = c.like_count ?? 0;
    setComments((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? {
              ...x,
              liked_by_me: !liked,
              like_count: Math.max(0, prevCount + (liked ? -1 : 1)),
            }
          : x,
      ),
    );
    try {
      const r = liked
        ? await unlikePostComment(postId, c.id)
        : await likePostComment(postId, c.id);
      setComments((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, like_count: r.like_count, liked_by_me: !liked } : x)),
      );
    } catch {
      setComments((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, liked_by_me: liked, like_count: prevCount } : x,
        ),
      );
    } finally {
      setLikingId(null);
    }
  };

  const onDelete = async (comment: FeedComment) => {
    if (!window.confirm('Удалить комментарий?')) return;
    setDeletingId(comment.id);
    try {
      await deletePostComment(postId, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      onCountChange?.(postId, -1);
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  };

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
        style={
          keyboardInset > 0
            ? { paddingBottom: `${keyboardInset}px` }
            : undefined
        }
      >
        <div className={styles.handle} aria-hidden />
        <div className={styles.head}>
          <button type="button" className={styles.closeBtn} aria-label="Закрыть" onClick={onClose}>
            <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <h2 id={titleId} className={styles.title}>
            Комментарии
          </h2>
          <span className={styles.headSpacer} aria-hidden />
        </div>

        <div className={styles.list} ref={listRef}>
          {loading ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.skelRow} aria-hidden>
                  <div className={styles.skelAvatar} />
                  <div className={styles.skelBody}>
                    <div className={`${styles.skelLine} ${styles.skelLineShort}`} />
                    <div className={`${styles.skelLine} ${styles.skelLineLong}`} />
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {!loading && error ? (
            <div className={styles.stateBox}>
              <p className={styles.errorText}>{error}</p>
              <button type="button" className={styles.retryBtn} onClick={() => void load()}>
                Повторить
              </button>
            </div>
          ) : null}

          {!loading && !error && comments.length === 0 ? (
            <div className={styles.stateBox}>
              <p className={styles.stateTitle}>Пока нет комментариев</p>
              <p className={styles.stateHint}>Начните обсуждение.</p>
            </div>
          ) : null}

          {!loading &&
            !error &&
            comments.map((c) => {
              const handle = commentHandle(c);
              const uname = c.author?.username?.trim() ?? '';
              const av = resolvePublicUrl(c.author?.avatar_url ?? null);
              const mine = myMemberId != null && c.member_id === myMemberId;
              const canDelete = mine || Boolean(isAdmin);
              const liked = Boolean(c.liked_by_me);
              const likeCount = c.like_count ?? 0;
              return (
                <div key={c.id} className={styles.row}>
                  {uname ? (
                    <Link
                      to={`/profile/${encodeURIComponent(uname)}`}
                      state={profileLinkState}
                      className={styles.avatar}
                      onClick={onClose}
                    >
                      {av ? (
                        <img src={av} alt="" />
                      ) : (
                        <LuUser className="h-4 w-4 opacity-40" aria-hidden />
                      )}
                    </Link>
                  ) : (
                    <div className={styles.avatar}>
                      {av ? (
                        <img src={av} alt="" />
                      ) : (
                        <LuUser className="h-4 w-4 opacity-40" aria-hidden />
                      )}
                    </div>
                  )}

                  <div className={styles.main}>
                    <div className={styles.meta}>
                      {uname ? (
                        <Link
                          to={`/profile/${encodeURIComponent(uname)}`}
                          state={profileLinkState}
                          className={styles.who}
                          onClick={onClose}
                        >
                          {handle}
                        </Link>
                      ) : (
                        <span className={styles.who}>{handle}</span>
                      )}
                      <span className={styles.dot} aria-hidden>
                        ·
                      </span>
                      <time className={styles.when} dateTime={c.created_at}>
                        {formatPostDate(c.created_at)}
                      </time>
                    </div>
                    <p className={styles.text}>{c.text}</p>
                    <button type="button" className={styles.replyBtn} onClick={() => onReply(c)}>
                      Ответить
                    </button>
                  </div>

                  <div className={styles.likeCol}>
                    <button
                      type="button"
                      className={`${styles.likeBtn} ${liked ? styles.likeBtnActive : ''}`}
                      aria-label={liked ? 'Убрать лайк' : 'Нравится'}
                      aria-pressed={liked}
                      disabled={likingId === c.id}
                      onClick={() => void onToggleLike(c)}
                    >
                      <LuHeart
                        className="h-[18px] w-[18px]"
                        strokeWidth={liked ? 0 : 1.75}
                        fill={liked ? 'currentColor' : 'none'}
                        aria-hidden
                      />
                    </button>
                    <span className={styles.likeCount}>{likeCount > 0 ? likeCount : ''}</span>
                    {canDelete ? (
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        aria-label="Удалить комментарий"
                        disabled={deletingId === c.id}
                        onClick={() => void onDelete(c)}
                      >
                        <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>

        <div className={styles.composerBlock}>
          <div className={styles.emojiRow} aria-label="Быстрые реакции">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emojiBtn}
                aria-label={`Добавить ${emoji}`}
                onClick={() => appendEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className={styles.composer}>
            <div className={styles.composerAvatar} aria-hidden>
              {myAv ? <img src={myAv} alt="" /> : <LuUser className="h-4 w-4 opacity-40" />}
            </div>
            <div className={styles.composerMain}>
              <div className={`${styles.inputWrap} ${inputFocused ? styles.inputWrapFocus : ''}`}>
                <textarea
                  ref={inputRef}
                  className={styles.input}
                  rows={1}
                  maxLength={COMMENT_MAX}
                  placeholder={placeholder}
                  value={text}
                  disabled={sending}
                  enterKeyHint="send"
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onChange={(e) => {
                    setText(e.target.value);
                    autosizeTextarea(e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.shiftKey) return;
                    if (!prefersDesktopComposer()) return;
                    e.preventDefault();
                    void onSend();
                  }}
                />
                <button
                  type="button"
                  className={styles.sendBtn}
                  disabled={sending || !text.trim()}
                  onClick={() => void onSend()}
                >
                  Опубл.
                </button>
              </div>
              {sendError ? <p className={styles.errorText}>{sendError}</p> : null}
              {nearLimit ? (
                <p className={`${styles.charHint} ${text.length >= COMMENT_MAX ? styles.charHintWarn : ''}`}>
                  {text.length}/{COMMENT_MAX}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
