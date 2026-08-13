import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSend } from 'react-icons/lu';

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

  const onDraftChange = useCallback((draft: { caption: string; files: File[] }) => {
    setCaption(draft.caption);
    setFiles(draft.files);
  }, []);

  const canPublish = files.length > 0 || caption.trim().length > 0;

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

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
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
            disabled={submitting || !canPublish}
            onClick={() => void submit()}
          >
            {submitting ? 'Публикация…' : 'Опубликовать'}
          </button>
        </header>
        <div className={styles.body}>
          <PostEditor instagramLayout onChange={onDraftChange} />
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.publishBtn}
            disabled={submitting || !canPublish}
            onClick={() => void submit()}
          >
            <LuSend className="h-4 w-4" aria-hidden />
            {submitting ? 'Публикация…' : 'Опубликовать'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
