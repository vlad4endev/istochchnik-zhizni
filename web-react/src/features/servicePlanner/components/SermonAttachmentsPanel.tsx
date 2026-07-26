import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { LuDownload, LuFileUp, LuLoaderCircle, LuPaperclip, LuTrash2 } from 'react-icons/lu';

import { resolvePublicUrl } from '@/lib/resolvePublicUrl';
import { emitAppToast } from '@/lib/uiFeedback';

import {
  formatAttachmentSize,
  parseSermonAttachments,
  SERMON_ATTACHMENT_ACCEPT,
  SERMON_ATTACHMENT_MAX_COUNT,
  sermonAttachmentExtLabel,
  type SermonAttachment,
  withSermonAttachments,
} from '../sermonAttachments';

type Props = {
  contentJson: Record<string, unknown>;
  onChange?: (contentJson: Record<string, unknown>) => void;
  /** Если задан — режим редактирования с загрузкой. Иначе только просмотр/скачивание. */
  onUploadFile?: (file: File) => Promise<SermonAttachment>;
  className?: string;
  compact?: boolean;
};

export function SermonAttachmentsPanel({
  contentJson,
  onChange,
  onUploadFile,
  className = '',
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const attachments = parseSermonAttachments(contentJson);
  const canEdit = typeof onUploadFile === 'function' && typeof onChange === 'function';
  const atLimit = attachments.length >= SERMON_ATTACHMENT_MAX_COUNT;

  async function handlePick(fileList: FileList | null): Promise<void> {
    if (!canEdit || !onUploadFile || !onChange) return;
    const file = fileList?.[0];
    if (!file) return;
    if (atLimit) {
      emitAppToast(`Можно прикрепить не больше ${SERMON_ATTACHMENT_MAX_COUNT} файлов`, 'error');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await onUploadFile(file);
      const next = [...attachments, uploaded].slice(0, SERMON_ATTACHMENT_MAX_COUNT);
      onChange(withSermonAttachments(contentJson, next));
      emitAppToast('Файл прикреплён к проповеди', 'success');
    } catch (e) {
      let msg = 'Не удалось загрузить файл';
      if (isAxiosError(e)) {
        const apiErr = e.response?.data as { error?: string } | undefined;
        if (typeof apiErr?.error === 'string' && apiErr.error.trim()) msg = apiErr.error.trim();
      } else if (e instanceof Error && e.message.trim()) {
        msg = e.message.trim();
      }
      emitAppToast(msg, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeAttachment(id: string): void {
    if (!onChange) return;
    onChange(withSermonAttachments(contentJson, attachments.filter((a) => a.id !== id)));
  }

  if (!canEdit && attachments.length === 0) return null;

  return (
    <div
      className={[
        compact
          ? 'space-y-1.5'
          : 'space-y-2 rounded-xl border border-rose-200/90 bg-rose-50/40 p-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!compact ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800/90">
            Файлы проповеди
          </p>
          {canEdit ? (
            <span className="text-[11px] text-stone-500">
              {attachments.length}/{SERMON_ATTACHMENT_MAX_COUNT}
            </span>
          ) : null}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="space-y-1.5">
          {attachments.map((a) => {
            const href = resolvePublicUrl(a.url) ?? a.url;
            const sizeLabel = formatAttachmentSize(a.size);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-100 text-[10px] font-bold text-rose-800">
                  {sermonAttachmentExtLabel(a.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900" title={a.name}>
                    {a.name}
                  </p>
                  {sizeLabel ? <p className="text-[11px] text-stone-500">{sizeLabel}</p> : null}
                </div>
                <a
                  href={href}
                  download={a.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-stone-300 px-2 text-xs font-semibold text-stone-700 hover:border-primary hover:text-primary"
                  title="Скачать"
                >
                  <LuDownload className="h-4 w-4" />
                  <span className="hidden sm:inline">Скачать</span>
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 text-stone-500 hover:border-rose-300 hover:text-rose-700"
                    title="Убрать файл"
                    aria-label={`Убрать ${a.name}`}
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : canEdit ? (
        <p className="text-xs text-stone-600">
          Прикрепите презентацию PowerPoint или PDF — ведущий и команда трансляции смогут скачать файл.
        </p>
      ) : null}

      {canEdit ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={SERMON_ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => void handlePick(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading || atLimit}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:border-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? (
              <>
                <LuLoaderCircle className="h-4 w-4 animate-spin" />
                Загрузка…
              </>
            ) : (
              <>
                <LuFileUp className="h-4 w-4" />
                {atLimit ? 'Достигнут лимит файлов' : 'Прикрепить презентацию / файл'}
              </>
            )}
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Компактный список ссылок для карточки блока (только скачивание). */
export function SermonAttachmentsLinks({
  contentJson,
  className = '',
}: {
  contentJson: Record<string, unknown> | null | undefined;
  className?: string;
}) {
  const attachments = parseSermonAttachments(contentJson);
  if (attachments.length === 0) return null;
  return (
    <div className={['space-y-1', className].filter(Boolean).join(' ')}>
      {attachments.map((a) => {
        const href = resolvePublicUrl(a.url) ?? a.url;
        return (
          <a
            key={a.id}
            href={href}
            download={a.name}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-rose-700 hover:underline sm:text-xs"
            title={`Скачать ${a.name}`}
          >
            <LuPaperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{a.name}</span>
            <LuDownload className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </a>
        );
      })}
    </div>
  );
}
