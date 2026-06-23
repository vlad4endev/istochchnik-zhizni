import { useRef } from 'react';
import { LuCamera, LuLoader, LuX } from 'react-icons/lu';

import { useSheetRecognition } from '@/hooks/useSheetRecognition';

import type { RecognizedSectionType, RecognizedSong } from './sheetMusicTypes';

type Props = {
  onApply: (data: RecognizedSong) => void;
  variant?: 'default' | 'studio';
};

const SECTION_BADGE_STYLES: Record<RecognizedSectionType, string> = {
  intro: 'bg-sky-100 text-sky-800',
  verse: 'bg-emerald-100 text-emerald-800',
  chorus: 'bg-violet-100 text-violet-800',
  bridge: 'bg-amber-100 text-amber-900',
  outro: 'bg-rose-100 text-rose-800',
  section: 'bg-stone-100 text-stone-700',
};

export function SheetRecognizer({ onApply, variant = 'studio' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { status, result, error, preview, recognize, reset } = useSheetRecognition();
  const isStudio = variant === 'studio';

  const shell = {
    drop:
      'border-2 border-dashed border-[var(--studio-editor-border)] rounded-xl p-6 text-center cursor-pointer hover:border-[var(--studio-editor-accent)]/40 hover:bg-[var(--studio-nav-active-bg)]/40 transition-colors',
    text: 'text-[var(--studio-editor-text)]',
    muted: 'text-[var(--studio-editor-mute)]',
    border: 'border-[var(--studio-editor-border)]',
    block: 'bg-[var(--studio-editor-block)]',
    primary: 'studio-btn-primary',
  };

  const handleFile = (file: File) => {
    void recognize(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (status === 'idle' && !preview) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className={
          isStudio
            ? shell.drop
            : 'cursor-pointer rounded-xl border-2 border-dashed border-stone-200 p-6 text-center hover:border-stone-300 hover:bg-stone-50'
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className={`mb-3 flex justify-center ${isStudio ? shell.muted : 'text-stone-500'}`}>
          <LuCamera className="h-10 w-10" aria-hidden />
        </div>
        <p className={`font-medium ${isStudio ? shell.text : 'text-stone-800'}`}>
          Сфотографируй партитуру
        </p>
        <p className={`mt-1 text-sm ${isStudio ? shell.muted : 'text-stone-400'}`}>
          Перетащи или нажми · JPEG, PNG, WebP · до 10 МБ
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {preview ? (
        <div className={`relative overflow-hidden rounded-xl border ${shell.border}`}>
          <img
            src={preview}
            alt="Партитура"
            className="max-h-56 w-full object-cover object-top"
          />
          <button
            type="button"
            onClick={reset}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-sm text-white hover:bg-black/70"
            aria-label="Убрать фото"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="flex items-center gap-3 rounded-xl bg-sky-50 p-4">
          <LuLoader className="h-5 w-5 shrink-0 animate-spin text-sky-500" aria-hidden />
          <div>
            <p className="text-sm font-medium text-sky-800">Анализирую партитуру…</p>
            <p className="mt-0.5 text-xs text-sky-600">
              Распознаю тональность, аккорды, структуру
            </p>
          </div>
        </div>
      ) : null}

      {status === 'error' && error ? (
        <div className="rounded-xl bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Не удалось распознать</p>
          <p className="mt-1 text-xs text-red-500">{error}</p>
          <button type="button" onClick={reset} className="mt-2 text-xs text-red-600 underline">
            Попробовать другое фото
          </button>
        </div>
      ) : null}

      {status === 'done' && result ? (
        <RecognitionResult result={result} onApply={() => onApply(result)} onReset={reset} />
      ) : null}
    </div>
  );
}

function RecognitionResult({
  result,
  onApply,
  onReset,
}: {
  result: RecognizedSong;
  onApply: () => void;
  onReset: () => void;
}) {
  const meta = [
    { label: 'Тональность', value: result.key },
    { label: 'Размер', value: result.timeSignature },
    { label: 'Темп', value: result.bpm ? `${result.bpm} bpm` : result.tempo },
    { label: 'Автор', value: result.composer },
  ].filter((r) => r.value);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--studio-editor-border)]">
      <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-emerald-800">Распознано</p>
          {result.title ? <p className="mt-0.5 text-xs text-emerald-600">{result.title}</p> : null}
        </div>
        <button type="button" onClick={onReset} className="text-xs text-emerald-700 underline">
          Новое фото
        </button>
      </div>

      {meta.length > 0 ? (
        <div className="grid grid-cols-2 gap-px bg-[var(--studio-editor-border)]">
          {meta.map(({ label, value }) => (
            <div key={label} className="bg-[var(--studio-editor-block)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--studio-editor-mute)]">
                {label}
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--studio-editor-text)]">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {result.sections.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--studio-editor-border)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--studio-editor-mute)]">
            Структура
          </p>
          {result.sections.map((section, i) => (
            <div key={`${section.label}-${i}`} className="flex items-start gap-2">
              <SectionBadge type={section.type} label={section.label} />
              <div className="min-w-0 flex-1">
                {section.chords.length > 0 ? (
                  <p className="font-mono text-xs text-sky-700">{section.chords.join(' · ')}</p>
                ) : null}
                {section.lyricHint ? (
                  <p className="mt-0.5 truncate text-xs italic text-[var(--studio-editor-mute)]">
                    «{section.lyricHint}»
                  </p>
                ) : null}
              </div>
              {section.bars ? (
                <span className="shrink-0 text-[10px] text-[var(--studio-editor-mute)]">
                  {section.bars} т.
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {result.generalNotes ? (
        <div className="border-t border-[var(--studio-editor-border)] bg-amber-50 px-4 py-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-600">
            Заметки
          </p>
          <p className="text-xs leading-relaxed text-amber-900">{result.generalNotes}</p>
        </div>
      ) : null}

      <div className="border-t border-[var(--studio-editor-border)] p-4">
        <button
          type="button"
          onClick={onApply}
          className="studio-btn-primary w-full rounded-xl py-2.5 text-sm font-medium"
        >
          Применить как версию с нотами
        </button>
      </div>
    </div>
  );
}

function SectionBadge({ type, label }: { type: RecognizedSectionType; label: string }) {
  const cls = SECTION_BADGE_STYLES[type] ?? SECTION_BADGE_STYLES.section;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}
