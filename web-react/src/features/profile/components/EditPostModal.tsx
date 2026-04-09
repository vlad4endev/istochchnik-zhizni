import { useCallback, useEffect, useState } from 'react';

import { patchProfilePostCaption, type ProfileFeedPost } from '../publicProfileApi';

import styles from './EditPostModal.module.css';
import profileShell from '../profileShell.module.css';

type Props = {
  open: boolean;
  post: ProfileFeedPost | null;
  onClose: () => void;
  onSaved: (postId: string, caption: string | null) => void;
};

export function EditPostModal({ open, post, onClose, onSaved }: Props) {
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && post) {
      setCaption(post.caption ?? '');
      setError(null);
    }
  }, [open, post]);

  const handleClose = useCallback(() => {
    if (busy) return;
    setError(null);
    onClose();
  }, [busy, onClose]);

  const submit = useCallback(async () => {
    if (!post) return;
    setBusy(true);
    setError(null);
    try {
      await patchProfilePostCaption(post.id, caption);
      onSaved(post.id, caption.trim() ? caption.trim() : null);
      handleClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '')
          : '';
      setError(msg.trim() || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }, [post, caption, onSaved, handleClose]);

  if (!open || !post) return null;

  return (
    <div className={`${styles.overlay} ${profileShell.profileRoot}`} role="dialog" aria-modal="true" aria-labelledby="edit-post-title">
      <button type="button" className={styles.backdrop} aria-label="Закрыть" onClick={handleClose} />
      <div className={styles.panel}>
        <header className={styles.head}>
          <button type="button" className={styles.btnGhost} onClick={handleClose} disabled={busy}>
            Отмена
          </button>
          <h2 id="edit-post-title" className={styles.title}>
            Редактировать
          </h2>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void submit()}>
            {busy ? '…' : 'Готово'}
          </button>
        </header>
        <div className={styles.body}>
          <p className={styles.hint}>
            Можно изменить текст. Фото и видео в этой версии не меняются — при необходимости удалите пост и создайте новый.
          </p>
          <textarea
            className={styles.textarea}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Текст публикации…"
            maxLength={8000}
            autoFocus
          />
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
