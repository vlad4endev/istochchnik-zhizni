import { useCallback, useState } from 'react';

import { createProfilePost } from '../publicProfileApi';
import { PostEditor } from './PostEditor';

import styles from './ProfileComposeModal.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onPublished: () => void;
};

export function ProfileComposeModal({ open, onClose, onPublished }: Props) {
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCaption('');
    setFiles([]);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, onClose, reset]);

  const submit = useCallback(async () => {
    if (files.length === 0 && !caption.trim()) {
      setError('Напишите текст или добавьте фото или видео.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createProfilePost({ files, caption });
      reset();
      onPublished();
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '')
          : '';
      setError(msg.trim() || 'Не удалось опубликовать. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }, [files, caption, onPublished, onClose, reset]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <button type="button" className={styles.backdrop} aria-label="Закрыть" onClick={handleClose} />
      <div className={styles.panel}>
        <header className={styles.head}>
          <button type="button" className={styles.headSideBtn} onClick={handleClose} disabled={submitting}>
            Отмена
          </button>
          <h2 id="compose-title" className={styles.headTitle}>
            Создать публикацию
          </h2>
          <button
            type="button"
            className={styles.headShare}
            disabled={submitting || (files.length === 0 && !caption.trim())}
            onClick={() => void submit()}
          >
            {submitting ? 'Публикация…' : 'Поделиться'}
          </button>
        </header>
        <div className={styles.body}>
          <PostEditor
            instagramLayout
            onChange={({ caption: c, files: f }) => {
              setCaption(c);
              setFiles(f);
            }}
          />
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
