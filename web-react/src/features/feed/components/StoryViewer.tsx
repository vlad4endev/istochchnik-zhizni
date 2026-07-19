import { useEffect, useRef, useState } from 'react';
import { LuTrash2, LuUser, LuX } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import { deleteStory, markStoryViewed, type StoryAuthorGroup } from '../feedApi';
import { formatPostDate } from './FeedPostCard';

import styles from './StoryViewer.module.css';

const IMAGE_MS = 5200;

export type StoryViewerProps = {
  group: StoryAuthorGroup | null;
  onClose: () => void;
  onViewed: (storyId: string) => void;
  onDeleted: (storyId: string) => void;
};

export function StoryViewer({ group, onClose, onViewed, onDeleted }: StoryViewerProps) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stories = group?.stories ?? [];
  const story = stories[index] ?? null;
  const isOwner = Boolean(group?.is_me);

  useEffect(() => {
    setIndex(0);
    setProgress(0);
  }, [group?.author.member_id]);

  useEffect(() => {
    if (!story) return;
    void markStoryViewed(story.id)
      .then(() => onViewed(story.id))
      .catch(() => undefined);

    if (timerRef.current) window.clearInterval(timerRef.current);
    setProgress(0);
    startRef.current = Date.now();

    if (story.media_type === 'video') {
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
    }

    timerRef.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - startRef.current) / IMAGE_MS);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stories.length, onClose]);

  if (!group || !story) return null;

  const name =
    memberNameFirstLast(group.author) ||
    group.author.display_name?.trim() ||
    group.author.username;
  const av = resolvePublicUrl(group.author.avatar_url);
  const mediaUrl = resolvePublicUrl(story.media_url) ?? '';

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

  const onDelete = async () => {
    if (!isOwner) return;
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

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Просмотр истории">
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
          <button type="button" className={styles.deleteBtn} aria-label="Удалить" onClick={() => void onDelete()}>
            <LuTrash2 className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
        <button type="button" className={styles.closeBtn} aria-label="Закрыть" onClick={onClose}>
          <LuX className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className={styles.stage}>
        <button type="button" className={styles.tapLeft} aria-label="Назад" onClick={goPrev} />
        <button type="button" className={styles.tapRight} aria-label="Дальше" onClick={goNext} />
        {story.media_type === 'video' ? (
          <video
            key={story.id}
            ref={videoRef}
            className={styles.media}
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
          <img key={story.id} className={styles.media} src={mediaUrl} alt="" />
        )}
        {story.caption?.trim() ? <p className={styles.caption}>{story.caption.trim()}</p> : null}
      </div>
    </div>
  );
}
