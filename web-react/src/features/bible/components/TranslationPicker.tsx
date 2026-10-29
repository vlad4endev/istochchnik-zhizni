import { useState } from 'react';
import { LuChevronDown } from 'react-icons/lu';

import type { BibleTranslation } from '../api';
import { translationBadge, translationPublisher } from '../bibleUiMeta';
import { TranslationsSheet } from './TranslationsSheet';

type Props = {
  translations: BibleTranslation[];
  value: string;
  onChange: (code: string) => void;
  /** Compact trigger for reader chrome */
  compact?: boolean;
};

export function TranslationPicker({ translations, value, onChange, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  if (translations.length === 0) return null;
  const current = translations.find((t) => t.code === value) ?? translations[0];
  if (!current) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'inline-flex max-w-full items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-left'
            : 'flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-3 text-left transition hover:border-primary/30'
        }
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-[10px] font-bold tracking-wide text-stone-800">
          {translationBadge(current)}
        </span>
        <span className="min-w-0 flex-1">
          {!compact ? (
            <span className="block truncate text-[11px] text-stone-400">
              {translationPublisher(current)}
            </span>
          ) : null}
          <span className="block truncate text-sm font-bold text-stone-900">
            {compact ? current.short_title || current.title : current.title}
          </span>
        </span>
        <LuChevronDown size={16} className="shrink-0 text-stone-400" />
      </button>

      <TranslationsSheet
        open={open}
        translations={translations}
        value={value}
        onClose={() => setOpen(false)}
        onChange={onChange}
      />
    </>
  );
}
