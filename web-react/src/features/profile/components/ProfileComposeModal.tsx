import { useCallback, useState } from 'react';
import { LuSend, LuX } from 'react-icons/lu';

import { createProfilePost } from '../publicProfileApi';
import { PostEditor } from './PostEditor';

import profileShell from '../profileShell.module.css';
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
    if (files.length === 0) {
      setError('Добавьте хотя бы одно фото или видео.');
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
      <div className={`${profileShell.profileRoot} ${styles.panel}`}>
        <div className={styles.head}>
          <h2 id="compose-title" className={styles.title}>
            Новая публикация
          </h2>
          <button type="button" className={styles.iconBtn} onClick={handleClose} aria-label="Закрыть">
            <LuX className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className={styles.body}>
          <PostEditor
            onChange={({ caption: c, files: f }) => {
              setCaption(c);
              setFiles(f);
            }}
          />
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.publishBtn}
            disabled={submitting || files.length === 0}
            onClick={() => void submit()}
          >
            <LuSend className="h-4 w-4" aria-hidden />
            {submitting ? 'Публикация…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  );
}
