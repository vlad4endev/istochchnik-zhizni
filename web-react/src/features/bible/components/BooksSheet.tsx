import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { BibleBook, BibleTranslation } from '../api';
import type { BibleRecentItem } from '../bibleUiMeta';
import { BibleSheetShell } from './BibleSheetShell';

type Props = {
  open: boolean;
  books: BibleBook[];
  translation: BibleTranslation | null;
  currentBookSlug?: string;
  /** Open directly on chapter grid for this book */
  initialBookSlug?: string | null;
  recent: BibleRecentItem[];
  onClose: () => void;
  onPick: (bookSlug: string, chapter: number) => void;
};

export function BooksSheet({
  open,
  books,
  translation,
  currentBookSlug,
  initialBookSlug = null,
  recent,
  onClose,
  onPick,
}: Props) {
  const [chapterBook, setChapterBook] = useState<BibleBook | null>(null);

  useEffect(() => {
    if (!open) {
      setChapterBook(null);
      return;
    }
    if (!initialBookSlug) return;
    const hit = books.find((b) => b.slug === initialBookSlug) ?? null;
    setChapterBook(hit);
  }, [open, initialBookSlug, books]);

  const ot = useMemo(() => books.filter((b) => b.testament === 'ot'), [books]);
  const nt = useMemo(() => books.filter((b) => b.testament === 'nt'), [books]);
  const translationTitle = translation?.title || 'Перевод';

  function closeAll() {
    setChapterBook(null);
    onClose();
  }

  return (
    <BibleSheetShell
      open={open}
      title={chapterBook ? chapterBook.name : 'Книги'}
      onClose={() => {
        if (chapterBook) {
          setChapterBook(null);
          return;
        }
        closeAll();
      }}
      showMore
      footer={
        chapterBook || recent.length === 0 ? null : (
          <div>
            <p className="mb-2 text-sm font-bold text-stone-900">Недавние</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
              {recent.slice(0, 6).map((r) => (
                <Link
                  key={`${r.translation}-${r.book_slug}-${r.chapter}-${r.at}`}
                  to={`/bible/${r.translation}/${r.book_slug}/${r.chapter}`}
                  onClick={closeAll}
                  className="min-w-[10.5rem] max-w-[12rem] shrink-0 rounded-2xl bg-stone-100 px-3 py-3"
                >
                  <p className="truncate text-sm font-bold text-stone-900">
                    {r.book_name} {r.chapter}
                  </p>
                  <p className="mt-1 truncate text-xs text-stone-500">{r.translation_title}</p>
                </Link>
              ))}
            </div>
          </div>
        )
      }
    >
      {chapterBook ? (
        <div className="p-4">
          <p className="mb-3 text-sm text-stone-500">{translationTitle}</p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {Array.from({ length: chapterBook.chapters_count }, (_, i) => i + 1).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => {
                  onPick(chapterBook.slug, ch);
                  closeAll();
                }}
                className="rounded-2xl bg-stone-100 py-3 text-sm font-bold text-stone-800 hover:bg-[#f3e8e4]"
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {nt.length > 0 ? (
            <BookList
              title="Новый Завет"
              books={nt}
              currentBookSlug={currentBookSlug}
              onSelect={setChapterBook}
            />
          ) : null}
          {ot.length > 0 && translation?.scope !== 'nt' ? (
            <BookList
              title="Ветхий Завет"
              books={ot}
              currentBookSlug={currentBookSlug}
              onSelect={setChapterBook}
            />
          ) : null}
        </div>
      )}
    </BibleSheetShell>
  );
}

function BookList({
  title,
  books,
  currentBookSlug,
  onSelect,
}: {
  title: string;
  books: BibleBook[];
  currentBookSlug?: string;
  onSelect: (book: BibleBook) => void;
}) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 bg-white/95 px-4 py-2 text-xs font-bold uppercase tracking-wide text-stone-400 backdrop-blur">
        {title}
      </h3>
      <ul>
        {books.map((b) => {
          const active = b.slug === currentBookSlug;
          return (
            <li key={b.slug}>
              <button
                type="button"
                onClick={() => onSelect(b)}
                className={[
                  'w-full px-4 py-3.5 text-left text-[17px] font-bold text-stone-900 transition',
                  active ? 'bg-[#f3e8e4]' : 'hover:bg-stone-50',
                ].join(' ')}
              >
                {b.name}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
