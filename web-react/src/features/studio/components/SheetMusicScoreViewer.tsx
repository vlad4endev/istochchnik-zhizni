import abcjs from 'abcjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { StudioSheetMeta } from '../api';

import './sheetMusicScore.css';

type Props = {
  sheetMeta?: StudioSheetMeta | null;
  songTitle?: string | null;
  songKey?: string | null;
  tempo?: number | null;
  timeSignature?: string | null;
  /** Запасной текст (ChordPro), если нет ABC и фото */
  fallbackContent?: string | null;
  compact?: boolean;
  className?: string;
};

function normalizeAbc(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^X:/m.test(trimmed)) return trimmed;
  return `X:1\n${trimmed}`;
}

function resolveImageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

/** Профессиональный просмотр партитуры: ABC (abcjs) + grand staff или исходное фото. */
export function SheetMusicScoreViewer({
  sheetMeta,
  songTitle,
  songKey,
  tempo,
  timeSignature,
  fallbackContent,
  compact = false,
  className = '',
}: Props) {
  const abcRef = useRef<HTMLDivElement>(null);
  const [abcError, setAbcError] = useState<string | null>(null);

  const title = sheetMeta?.title?.trim() || songTitle?.trim() || '';
  const composer = sheetMeta?.composer?.trim() || '';
  const arranger = sheetMeta?.arranger?.trim() || '';
  const sheetKeyLabel = songKey?.trim() || '';
  const bpm = sheetMeta?.bpm ?? tempo;
  const timeSig = sheetMeta?.timeSignature ?? timeSignature;
  const abc = sheetMeta?.abcNotation?.trim() ?? '';
  const imageUrl = sheetMeta?.sourceImageUrl?.trim() ?? '';

  const normalizedAbc = useMemo(() => normalizeAbc(abc), [abc]);

  useEffect(() => {
    setAbcError(null);
    if (!abcRef.current || !normalizedAbc) return;

    abcRef.current.innerHTML = '';
    try {
      const visual = abcjs.renderAbc(abcRef.current, normalizedAbc, {
        responsive: 'resize',
        scale: compact ? 1 : 1.15,
        staffwidth: compact ? 680 : 820,
        paddingleft: 0,
        paddingright: 0,
        add_classes: true,
      });
      const warnings = visual[0]?.warnings;
      if (warnings?.length) {
        setAbcError(warnings.slice(0, 2).join(' · '));
      }
    } catch (e) {
      setAbcError(e instanceof Error ? e.message : 'Ошибка отображения нот');
    }
  }, [normalizedAbc, compact]);

  const hasAbc = Boolean(normalizedAbc);
  const hasImage = Boolean(imageUrl);
  const hasFallback = Boolean(fallbackContent?.trim());

  if (!hasAbc && !hasImage && !hasFallback) {
    return (
      <p className="py-6 text-center text-sm text-[var(--text-muted)]">
        Загрузите фото партитуры через «Распознать ноты» — появится нотный лист как на оригинале.
      </p>
    );
  }

  return (
    <article
      className={[
        'sheet-music-score overflow-hidden rounded-xl border border-stone-200 bg-white text-stone-900 shadow-sm',
        compact ? 'sheet-music-score--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="sheet-music-score__header border-b border-stone-200 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 text-center sm:text-left">
            {title ? (
              <h3 className="font-serif text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
                {title}
              </h3>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-600 sm:justify-start">
              {sheetKeyLabel ? <span>Тональность: {sheetKeyLabel}</span> : null}
              {timeSig ? <span>Размер: {timeSig}</span> : null}
              {bpm ? <span>♩ = {bpm}</span> : null}
            </div>
          </div>
          {(composer || arranger) && (
            <div className="shrink-0 text-right text-xs leading-relaxed text-stone-600">
              {arranger ? (
                <p>
                  Arranged By <span className="font-medium text-stone-800">{arranger}</span>
                </p>
              ) : null}
              {composer ? (
                <p>
                  Written by <span className="font-medium text-stone-800">{composer}</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </header>

      <div className="sheet-music-score__body px-2 py-3 sm:px-4 sm:py-4">
        {hasAbc ? (
          <div
            ref={abcRef}
            className="sheet-music-score__abc mx-auto max-w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
          />
        ) : null}

        {abcError ? (
          <p className="mx-auto mt-2 max-w-xl px-3 text-center text-xs text-amber-700">{abcError}</p>
        ) : null}

        {!hasAbc && hasImage ? (
          <figure className="mx-auto max-w-4xl">
            <img
              src={resolveImageUrl(imageUrl)}
              alt={title ? `Партитура «${title}»` : 'Партитура'}
              className="mx-auto w-full rounded-lg border border-stone-100 bg-white object-contain shadow-inner"
              loading="lazy"
            />
          </figure>
        ) : null}

        {hasAbc && hasImage ? (
          <details className="mx-auto mt-4 max-w-4xl rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-stone-700">Исходное фото партитуры</summary>
            <img
              src={resolveImageUrl(imageUrl)}
              alt="Исходное фото"
              className="mt-3 w-full rounded-md border border-stone-200 object-contain"
              loading="lazy"
            />
          </details>
        ) : null}

        {!hasAbc && !hasImage && hasFallback ? (
          <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-stone-700">
            {fallbackContent}
          </pre>
        ) : null}
      </div>

      {sheetMeta?.generalNotes?.trim() ? (
        <footer className="border-t border-stone-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-950 sm:px-6">
          {sheetMeta.generalNotes}
        </footer>
      ) : null}
    </article>
  );
}
