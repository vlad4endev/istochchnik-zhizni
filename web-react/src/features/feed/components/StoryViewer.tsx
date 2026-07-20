import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuSend, LuTrash2, LuUser, LuX } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import { deleteStory, markStoryViewed, replyToStory, type StoryAuthorGroup } from '../feedApi';
import { formatPostDate } from './FeedPostCard';

import styles from './StoryViewer.module.css';

const IMAGE_MS = 5200;
const SWIPE_CLOSE_PX = 80;
const HOLD_PAUSE_MS = 180;
const TAP_MOVE_TOLERANCE = 12;
const REPLY_MAX = 1000;
const STORY_REACTIONS = ['❤️', '😂', '😮', '😢', '😍', '🔥', '👏', '🙌'] as const;

export type StoryViewerProps = {
  group: StoryAuthorGroup | null;
  onClose: () => void;
  onViewed: (storyId: string) => void;
  onDeleted: (storyId: string) => void;
};

export function StoryViewer({ group, onClose, onViewed, onDeleted }: StoryViewerProps) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyFlash, setReplyFlash] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);

  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const elapsedRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pausedRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const swipeAxisRef = useRef<'undecided' | 'vertical' | 'horizontal'>('undecided');
  const holdTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const dragYRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);

  const stories = group?.stories ?? [];
  const story = stories[index] ?? null;
  const isOwner = Boolean(group?.is_me);
  const canReply = Boolean(group && !group.is_me && story);

  useEffect(() => {
    setIndex(0);
    setProgress(0);
    elapsedRef.current = 0;
    setPaused(false);
    setDragY(0);
    dragYRef.current = 0;
    setDragging(false);
    setReplyText('');
    setReplyFlash(null);
    setComposerFocused(false);
  }, [group?.author.member_id]);

  useEffect(() => {
    setReplyText('');
    setReplyFlash(null);
  }, [story?.id]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!group) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [group]);

  useEffect(() => {
    if (!story) return;
    void markStoryViewed(story.id)
      .then(() => onViewed(story.id))
      .catch(() => undefined);

    if (timerRef.current) window.clearInterval(timerRef.current);
    setProgress(0);
    elapsedRef.current = 0;
    startRef.current = Date.now();
    setPaused(false);

    if (story.media_type === 'video') {
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
    }

    timerRef.current = window.setInterval(() => {
      if (pausedRef.current) return;
      const p = Math.min(1, (elapsedRef.current + (Date.now() - startRef.current)) / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        setIndex((i) => {
          if (i + 1 >= stories.length) {
            onClose();
            return i;
          }
          return i + 1;
        });
      }
    }, 40);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [story?.id, stories.length, onClose, onViewed, story]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || story?.media_type !== 'video') return;
    if (paused) {
      video.pause();
    } else {
      void video.play().catch(() => undefined);
    }
  }, [paused, story?.id, story?.media_type]);

  useEffect(() => {
    if (composerFocused) {
      pausePlayback();
    } else if (!heldRef.current && swipeAxisRef.current !== 'vertical') {
      resumePlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerFocused]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const goPrev = () => {
    if (index <= 0) {
      onClose();
      return;
    }
    setIndex((i) => i - 1);
  };

  const goNext = () => {
    if (index + 1 >= stories.length) {
      onClose();
      return;
    }
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (composerFocused) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stories.length, onClose, composerFocused]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const pausePlayback = () => {
    if (pausedRef.current) return;
    if (story?.media_type !== 'video') {
      elapsedRef.current += Date.now() - startRef.current;
    }
    setPaused(true);
  };

  const resumePlayback = () => {
    if (!pausedRef.current) return;
    if (composerFocused) return;
    if (story?.media_type !== 'video') {
      startRef.current = Date.now();
    }
    setPaused(false);
  };

  const isChromeTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(`.${styles.head}, .${styles.footer}`));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isChromeTarget(e.target)) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    pointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    swipeAxisRef.current = 'undecided';
    heldRef.current = false;
    dragYRef.current = 0;
    setDragging(false);
    setDragY(0);
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      pausePlayback();
    }, HOLD_PAUSE_MS);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (swipeAxisRef.current === 'undecided') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeAxisRef.current = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
      if (swipeAxisRef.current === 'vertical') {
        clearHoldTimer();
        pausePlayback();
        setDragging(true);
      } else {
        clearHoldTimer();
      }
    }

    if (swipeAxisRef.current === 'vertical') {
      const nextY = Math.max(0, dy);
      dragYRef.current = nextY;
      setDragY(nextY);
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== e.pointerId) return;
    clearHoldTimer();
    pointerStartRef.current = null;

    const axis = swipeAxisRef.current;
    const finalDragY = dragYRef.current;
    const wasHeld = heldRef.current;
    swipeAxisRef.current = 'undecided';
    heldRef.current = false;
    dragYRef.current = 0;
    setDragging(false);
    setDragY(0);

    if (axis === 'vertical') {
      if (finalDragY > SWIPE_CLOSE_PX) {
        onClose();
        return;
      }
      resumePlayback();
      return;
    }

    if (wasHeld) {
      resumePlayback();
      return;
    }

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > TAP_MOVE_TOLERANCE) {
      if (pausedRef.current) resumePlayback();
      return;
    }

    const rect = overlayRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const left = rect?.left ?? 0;
    const relX = e.clientX - left;
    if (relX < width * 0.35) goPrev();
    else goNext();
  };

  const showFlash = (msg: string) => {
    setReplyFlash(msg);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setReplyFlash(null), 1800);
  };

  const sendReply = async (opts: { text?: string; reaction?: string }) => {
    if (!story || !canReply || replyBusy) return;
    const text = opts.text?.trim() ?? '';
    const reaction = opts.reaction?.trim() ?? '';
    if (!text && !reaction) return;
    setReplyBusy(true);
    pausePlayback();
    try {
      await replyToStory(story.id, { text: text || undefined, reaction: reaction || undefined });
      if (text) setReplyText('');
      showFlash(reaction && !text ? 'Реакция отправлена в чат' : 'Ответ отправлен в чат');
      inputRef.current?.blur();
    } catch {
      showFlash('Не удалось отправить');
    } finally {
      setReplyBusy(false);
      if (!composerFocused) resumePlayback();
    }
  };

  const onDelete = async () => {
    if (!isOwner || !story) return;
    if (!window.confirm('Удалить эту историю?')) return;
    try {
      await deleteStory(story.id);
      onDeleted(story.id);
      if (stories.length <= 1) onClose();
      else setIndex((i) => Math.min(i, stories.length - 2));
    } catch {
      /* ignore */
    }
  };

  if (!group || !story) return null;

  const name =
    memberNameFirstLast(group.author) ||
    group.author.display_name?.trim() ||
    group.author.username;
  const av = resolvePublicUrl(group.author.avatar_url);
  const mediaUrl = resolvePublicUrl(story.media_url) ?? '';
  const isVideo = story.media_type === 'video';
  const dragOpacity = dragY > 0 ? Math.max(0.35, 1 - dragY / 320) : 1;
  const caption = story.caption?.trim() ?? '';

  const overlay = (
    <div
      ref={overlayRef}
      className={`${styles.overlay}${dragging ? ` ${styles.overlayDragging}` : ''}${canReply ? ` ${styles.withReply}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр истории"
      style={{
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        opacity: dragOpacity,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div className={styles.stage}>
        {!isVideo && mediaUrl ? (
          <>
            <img className={styles.blurLayer} src={mediaUrl} alt="" aria-hidden draggable={false} />
            <div className={styles.blurScrim} aria-hidden />
          </>
        ) : null}
        {isVideo ? (
          <video
            key={story.id}
            ref={videoRef}
            className={`${styles.media} ${styles.mediaVideo}`}
            src={mediaUrl}
            autoPlay
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress(v.currentTime / v.duration);
            }}
            onEnded={goNext}
          />
        ) : (
          <img key={story.id} className={styles.media} src={mediaUrl} alt="" draggable={false} />
        )}
      </div>

      <div className={styles.chrome}>
        <div className={styles.progressRow}>
          {stories.map((s, i) => (
            <div key={s.id} className={styles.progressTrack}>
              <div
                className={`${styles.progressFill} ${i < index ? styles.progressDone : ''}`}
                style={i === index ? { width: `${Math.round(progress * 100)}%` } : undefined}
              />
            </div>
          ))}
        </div>

        <div className={styles.head}>
          <div className={styles.avatar}>
            {av ? <img src={av} alt="" /> : <LuUser className="h-4 w-4 m-1.5 opacity-50" />}
          </div>
          <div className={styles.meta}>
            <p className={styles.name}>{name}</p>
            <p className={styles.time}>{formatPostDate(story.created_at)}</p>
          </div>
          {isOwner ? (
            <button
              type="button"
              className={styles.deleteBtn}
              aria-label="Удалить"
              onClick={() => void onDelete()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <LuTrash2 className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Закрыть"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <LuX className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {caption ? <p className={styles.caption}>{caption}</p> : null}

      {canReply ? (
        <div
          className={styles.footer}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {replyFlash ? <p className={styles.replyFlash} role="status">{replyFlash}</p> : null}
          <div className={styles.reactionRow} aria-label="Быстрые реакции">
            {STORY_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.reactionBtn}
                aria-label={`Реакция ${emoji}`}
                disabled={replyBusy}
                onClick={() => void sendReply({ reaction: emoji })}
              >
                {emoji}
              </button>
            ))}
          </div>
          <form
            className={styles.replyForm}
            onSubmit={(e) => {
              e.preventDefault();
              void sendReply({ text: replyText });
            }}
          >
            <input
              ref={inputRef}
              className={styles.replyInput}
              type="text"
              maxLength={REPLY_MAX}
              placeholder="Отправить сообщение…"
              value={replyText}
              disabled={replyBusy}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className={styles.replySend}
              aria-label="Отправить"
              disabled={replyBusy || !replyText.trim()}
            >
              <LuSend className="h-5 w-5" aria-hidden />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );

  return createPortal(overlay, document.body);
}
