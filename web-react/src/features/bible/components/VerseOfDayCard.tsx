import { Link } from 'react-router-dom';
import { LuShare2 } from 'react-icons/lu';

import type { BibleVerseOfDay } from '../api';
import { shareBibleVerse } from '../shareVerse';

type Props = {
  verse: BibleVerseOfDay;
  translation: string;
  translationTitle: string;
};

export function VerseOfDayCard({ verse, translation, translationTitle }: Props) {
  const reference = `${verse.short_name} ${verse.chapter}:${verse.verse_start}${
    verse.verse_end !== verse.verse_start ? `–${verse.verse_end}` : ''
  }`;
  const url = `/bible/${translation}/${verse.book_slug}/${verse.chapter}?v=${verse.verse_start}`;

  return (
    <section className="mt-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] px-5 py-4 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Стих дня</p>
        <button
          type="button"
          aria-label="Поделиться стихом дня"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          onClick={() =>
            void shareBibleVerse({
              reference,
              text: verse.text,
              translationTitle,
              url: `${window.location.origin}${url}`,
            })
          }
        >
          <LuShare2 size={16} />
        </button>
      </div>
      <p className="font-serif text-[17px] leading-7 text-stone-900">«{verse.text}»</p>
      <Link to={url} className="mt-2 inline-block text-sm font-bold text-primary">
        {reference}
      </Link>
    </section>
  );
}
