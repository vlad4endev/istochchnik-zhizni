import { useEffect, useId, useRef, useState } from 'react';
import { LuImagePlus } from 'react-icons/lu';

import { createStory } from '../feedApi';

import styles from './StoryComposeModal.module.css';

export type StoryComposeModalProps = {
  open: boolean;
  onClose: () => void;
  onPublished: () => void;
};

export function StoryComposeModal({ open, onClose, onPublished }: StoryComposeModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setCaption('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  const isVideo = file?.type.startsWith('video/') ?? false;

  const onPublish = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createStory({ file, caption });
      onPublished();
      onClose();
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data?.error ??
                'Не удалось опубликовать историю',
            )
          : 'Не удалось опубликовать историю';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.title}>
          Новая история
        </h2>
        <p className={styles.hint}>Фото или видео будет видно 24 часа.</p>

        <div className={styles.preview}>
          {preview ? (
            isVideo ? (
              <video src={preview} controls playsInline />
            ) : (
              <img src={preview} alt="" />
            )
          ) : (
            <span style={{ opacity: 0.45, fontSize: '0.85rem' }}>Превью</span>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className={styles.hidden}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" className={styles.fileBtn} onClick={() => inputRef.current?.click()}>
          <LuImagePlus className="h-4 w-4" aria-hidden />
          {file ? 'Заменить файл' : 'Выбрать фото или видео'}
        </button>

        <textarea
          className={styles.caption}
          maxLength={500}
          placeholder="Подпись (необязательно)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.publishBtn}
            disabled={!file || busy}
            onClick={() => void onPublish()}
          >
            {busy ? 'Публикация…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  );
}
