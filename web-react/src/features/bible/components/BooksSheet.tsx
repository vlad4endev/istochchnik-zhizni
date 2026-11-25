import { useEffect, useMemo, useState } from 'react';

import type { BibleBook, BibleTranslation } from '../api';
import { BibleSheetShell } from './BibleSheetShell';

type Props = {
  open: boolean;
  books: BibleBook[];
  translation: BibleTranslation | null;
  currentBookSlug?: string;
  /** Open directly on chapter grid for this book */
  initialBookSlug?: string | null;
  onClose: () => void;
  onPick: (bookSlug: string, chapter: number) => void;
};

export function BooksSheet({
  open,
  books,
  translation,
  currentBookSlug,
  initialBookSlug = null,
  onClose,
  onPick,
}: Props) {
  const [chapterBook, setChapterBook] = useState<BibleBook | null>(null);
  const [tab, setTab] = useState<'nt' | 'ot'>('nt');

  useEffect(() => {
    if (!open) {
      setChapterBook(null);
      return;
    }
    const focusSlug = initialBookSlug ?? currentBookSlug ?? null;
    const focusBook = focusSlug ? (books.find((b) => b.slug === focusSlug) ?? null) : null;
    setChapterBook(initialBookSlug ? focusBook : null);
    setTab(focusBook?.testament === 'ot' ? 'ot' : 'nt');
  }, [open, initialBookSlug, currentBookSlug, books]);

  const ot = useMemo(() => books.filter((b) => b.testament === 'ot'), [books]);
  const nt = useMemo(() => books.filter((b) => b.testament === 'nt'), [books]);
  const showTabs = ot.length > 0 && nt.length > 0 && translation?.scope !== 'nt';
  const visibleBooks = tab === 'ot' && showTabs ? ot : nt;
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
          {showTabs ? (
            <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
              {/* flex, не grid-cols-2: mobile.css на <640px сводит grid-cols-2 в колонку — табы должны быть горизонтальными */}
              <div className="flex gap-1 rounded-2xl bg-stone-100 p-1">
                {(
                  [
                    ['nt', 'Новый Завет'],
                    ['ot', 'Ветхий Завет'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={[
                      'flex-1 rounded-xl py-2 text-sm font-semibold transition',
                      tab === key
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <BookList books={visibleBooks} currentBookSlug={currentBookSlug} onSelect={setChapterBook} />
        </div>
      )}
    </BibleSheetShell>
  );
}

function BookList({
  books,
  currentBookSlug,
  onSelect,
}: {
  books: BibleBook[];
  currentBookSlug?: string;
  onSelect: (book: BibleBook) => void;
}) {
  return (
    <ul className="pb-2">
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
  );
}
