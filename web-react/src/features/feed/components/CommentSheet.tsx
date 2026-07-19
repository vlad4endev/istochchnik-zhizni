import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuTrash2, LuUser, LuX } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import {
  createPostComment,
  deletePostComment,
  fetchPostComments,
  type FeedComment,
} from '../feedApi';
import { formatPostDate } from './FeedPostCard';

import styles from './CommentSheet.module.css';

function commentAuthorName(c: FeedComment): string {
  if (!c.author) return 'Участник';
  const uname = (c.author.username ?? '').trim();
  const isPlaceholder = /^member-\d+$/i.test(uname);
  return (
    memberNameFirstLast(c.author) ||
    c.author.display_name?.trim() ||
    (!isPlaceholder && uname ? `@${uname}` : 'Участник')
  );
}

export type CommentSheetProps = {
  open: boolean;
  postId: string | null;
  myMemberId: number | null;
  isAdmin?: boolean;
  profileLinkState?: { backTo?: string; backLabel?: string };
  onClose: () => void;
  onCountChange?: (postId: string, delta: number) => void;
};

export function CommentSheet({
  open,
  postId,
  myMemberId,
  isAdmin,
  profileLinkState,
  onClose,
  onCountChange,
}: CommentSheetProps) {
  const titleId = useId();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    void load();
  }, [open, postId, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !postId) return null;

  const onSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
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
          author: null,
        },
      ]);
      setText('');
      onCountChange?.(postId, 1);
      void load();
    } catch {
      /* ignore */
    } finally {
      setSending(false);
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
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.handle} aria-hidden />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            Комментарии
          </h2>
          <button type="button" className={styles.closeBtn} aria-label="Закрыть" onClick={onClose}>
            <LuX className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className={styles.list}>
          {loading ? <p className={styles.loading}>Загрузка…</p> : null}
          {!loading && error ? <p className={styles.error}>{error}</p> : null}
          {!loading && !error && comments.length === 0 ? (
            <p className={styles.empty}>Пока нет комментариев. Будьте первым.</p>
          ) : null}
          {!loading &&
            !error &&
            comments.map((c) => {
              const name = commentAuthorName(c);
              const uname = c.author?.username?.trim() ?? '';
              const av = resolvePublicUrl(c.author?.avatar_url ?? null);
              const canDelete =
                (myMemberId != null && c.member_id === myMemberId) || Boolean(isAdmin);
              return (
                <div key={c.id} className={styles.row}>
                  {uname ? (
                    <Link
                      to={`/profile/${encodeURIComponent(uname)}`}
                      state={profileLinkState}
                      className={styles.avatar}
                    >
                      {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1.5 opacity-40" />}
                    </Link>
                  ) : (
                    <div className={styles.avatar}>
                      {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1.5 opacity-40" />}
                    </div>
                  )}
                  <div className={styles.body}>
                    <div className={styles.meta}>
                      {uname ? (
                        <Link
                          to={`/profile/${encodeURIComponent(uname)}`}
                          state={profileLinkState}
                          className={styles.who}
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className={styles.who}>{name}</span>
                      )}
                      <time className={styles.when} dateTime={c.created_at}>
                        {formatPostDate(c.created_at)}
                      </time>
                    </div>
                    <p className={styles.text}>{c.text}</p>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      aria-label="Удалить комментарий"
                      disabled={deletingId === c.id}
                      onClick={() => void onDelete(c)}
                    >
                      <LuTrash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              );
            })}
        </div>

        <div className={styles.composer}>
          <textarea
            className={styles.input}
            rows={1}
            maxLength={2000}
            placeholder="Написать комментарий…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={sending || !text.trim()}
            onClick={() => void onSend()}
          >
            Отпр.
          </button>
        </div>
      </div>
    </div>
  );
}
