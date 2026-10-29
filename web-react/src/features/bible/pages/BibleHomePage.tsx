import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LuChevronRight, LuNotebookPen, LuSearch, LuSparkles } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';

import {
  fetchBibleBooks,
  fetchBibleProgress,
  fetchBiblePlans,
  fetchBibleTranslations,
  searchBible,
} from '../api';
import { parseBibleRef } from '../bibleRef';
import {
  pushRecentBible,
  readRecentBible,
  readStoredTranslation,
  writeStoredTranslation,
  type BibleRecentItem,
} from '../bibleUiMeta';
import { BooksSheet } from '../components/BooksSheet';
import { TranslationPicker } from '../components/TranslationPicker';

export function BibleHomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [submitted, setSubmitted] = useState(initialQ);
  const [booksOpen, setBooksOpen] = useState(false);
  const [initialBookSlug, setInitialBookSlug] = useState<string | null>(null);
  const [recent, setRecent] = useState<BibleRecentItem[]>(() => readRecentBible());
  const [translation, setTranslation] = useState(() => readStoredTranslation('synodal'));

  const translationsQ = useQuery({
    queryKey: ['bible', 'translations'],
    queryFn: fetchBibleTranslations,
  });

  useEffect(() => {
    writeStoredTranslation(translation);
  }, [translation]);

  const currentMeta = (translationsQ.data ?? []).find((t) => t.code === translation) ?? null;
  const hasText = Boolean(currentMeta?.verse_count && currentMeta.verse_count > 0);

  const booksQ = useQuery({
    queryKey: ['bible', 'books', translation],
    queryFn: () => fetchBibleBooks(translation),
  });
  const progressQ = useQuery({
    queryKey: ['bible', 'progress', translation],
    queryFn: () => fetchBibleProgress(translation),
  });
  const plansQ = useQuery({
    queryKey: ['bible', 'plans'],
    queryFn: fetchBiblePlans,
  });
  const searchQ = useQuery({
    queryKey: ['bible', 'search', translation, submitted],
    queryFn: () => searchBible(submitted, translation),
    enabled: submitted.trim().length >= 2 && hasText,
  });

  const ot = useMemo(() => (booksQ.data ?? []).filter((b) => b.testament === 'ot'), [booksQ.data]);
  const nt = useMemo(() => (booksQ.data ?? []).filter((b) => b.testament === 'nt'), [booksQ.data]);
  const progress = progressQ.data;
  const previewBooks = useMemo(() => {
    const all = [...nt, ...(currentMeta?.scope === 'nt' ? [] : ot)];
    return all.slice(0, 12);
  }, [nt, ot, currentMeta?.scope]);

  function goToChapter(bookSlug: string, chapter: number, bookName?: string, shortName?: string) {
    const book = (booksQ.data ?? []).find((b) => b.slug === bookSlug);
    setRecent(
      pushRecentBible({
        translation,
        translation_title: currentMeta?.title || translation,
        book_slug: bookSlug,
        book_name: bookName || book?.name || bookSlug,
        short_name: shortName || book?.short_name || bookSlug,
        chapter,
      }),
    );
    void navigate(`/bible/${translation}/${bookSlug}/${chapter}`);
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    const parsed = parseBibleRef(trimmed);
    if (parsed) {
      const book = (booksQ.data ?? []).find((b) => b.slug === parsed.bookSlug);
      setRecent(
        pushRecentBible({
          translation,
          translation_title: currentMeta?.title || translation,
          book_slug: parsed.bookSlug,
          book_name: book?.name || parsed.bookSlug,
          short_name: book?.short_name || parsed.bookSlug,
          chapter: parsed.chapter,
        }),
      );
      void navigate(
        `/bible/${translation}/${parsed.bookSlug}/${parsed.chapter}${
          parsed.verseStart != null ? `?v=${parsed.verseStart}` : ''
        }`,
      );
      return;
    }
    setSubmitted(trimmed);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-4 sm:px-5">
        <TranslationPicker
          translations={translationsQ.data ?? []}
          value={translation}
          onChange={setTranslation}
        />

        {progress && hasText ? (
          <button
            type="button"
            onClick={() =>
              goToChapter(progress.book_slug, progress.chapter, progress.book_name, progress.short_name)
            }
            className="mt-4 block w-full rounded-3xl bg-gradient-to-br from-stone-800 to-stone-700 px-5 py-4 text-left text-white shadow-[var(--shadow)]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Продолжить чтение
            </p>
            <p className="mt-1 text-lg font-bold">
              {progress.short_name} {progress.chapter}:{progress.verse}
            </p>
            <p className="mt-0.5 text-sm text-white/80">{progress.book_name}</p>
          </button>
        ) : null}

        <form onSubmit={onSearchSubmit} className="relative mt-4">
          <LuSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={18}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск или ссылка: Ин 3:16"
            className="w-full rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] py-3 pl-10 pr-4 text-[15px] outline-none ring-primary/30 focus:ring-2"
          />
        </form>

        {submitted.trim().length >= 2 && hasText ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-stone-500">Результаты</p>
            {(searchQ.data ?? []).length === 0 && !searchQ.isLoading ? (
              <p className="text-sm text-stone-500">Ничего не найдено</p>
            ) : null}
            {(searchQ.data ?? []).map((hit) => (
              <button
                key={`${hit.book_slug}-${hit.chapter}-${hit.verse}`}
                type="button"
                onClick={() => {
                  setRecent(
                    pushRecentBible({
                      translation,
                      translation_title: currentMeta?.title || translation,
                      book_slug: hit.book_slug,
                      book_name: hit.book_name,
                      short_name: hit.short_name,
                      chapter: hit.chapter,
                    }),
                  );
                  void navigate(
                    `/bible/${translation}/${hit.book_slug}/${hit.chapter}?v=${hit.verse}`,
                  );
                }}
                className="block w-full rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3 text-left"
              >
                <p className="text-sm font-bold text-stone-900">
                  {hit.short_name} {hit.chapter}:{hit.verse}
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">{hit.text}</p>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/bible/notes"
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-4 py-2.5 text-sm font-semibold text-stone-800"
          >
            <LuNotebookPen size={16} /> Заметки
          </Link>
          <Link
            to="/bible/plans"
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-4 py-2.5 text-sm font-semibold text-stone-800"
          >
            <LuSparkles size={16} /> Планы чтения
          </Link>
        </div>

        {(plansQ.data ?? []).slice(0, 2).map((plan) => (
          <Link
            key={plan.id}
            to={`/bible/plans/${plan.id}`}
            className="mt-3 rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
          >
            <p className="font-bold text-stone-900">{plan.title}</p>
            {plan.goal ? <p className="mt-1 line-clamp-2 text-sm text-stone-600">{plan.goal}</p> : null}
          </Link>
        ))}

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">Книги</h2>
          <button
            type="button"
            onClick={() => {
              setInitialBookSlug(null);
              setBooksOpen(true);
            }}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            Все <LuChevronRight size={16} />
          </button>
        </div>

        <div className="mt-2 overflow-hidden rounded-3xl border border-stone-200/80 bg-white">
          {previewBooks.map((b) => (
            <button
              key={b.slug}
              type="button"
              onClick={() => {
                setInitialBookSlug(b.slug);
                setBooksOpen(true);
              }}
              className="block w-full border-b border-stone-100 px-4 py-3.5 text-left text-[16px] font-bold text-stone-900 last:border-b-0 hover:bg-[#f3e8e4]"
            >
              {b.name}
            </button>
          ))}
          {(booksQ.data ?? []).length === 0 && !booksQ.isLoading ? (
            <p className="px-4 py-6 text-sm text-stone-500">Книги пока недоступны</p>
          ) : null}
        </div>

        {recent.length > 0 ? (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-stone-900">Недавние</h2>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
              {recent.slice(0, 8).map((r) => (
                <Link
                  key={`${r.translation}-${r.book_slug}-${r.chapter}-${r.at}`}
                  to={`/bible/${r.translation}/${r.book_slug}/${r.chapter}`}
                  className="min-w-[10.5rem] max-w-[12rem] shrink-0 rounded-2xl bg-stone-100 px-3 py-3"
                >
                  <p className="truncate text-sm font-bold text-stone-900">
                    {r.book_name} {r.chapter}
                  </p>
                  <p className="mt-1 truncate text-xs text-stone-500">{r.translation_title}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!hasText && !booksQ.isLoading ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Текст перевода ещё не загружен</p>
            <p className="mt-1">
              На сервере: <code>npm run bible:seed -- --translation={translation}</code>
            </p>
          </div>
        ) : null}
      </div>

      <BooksSheet
        open={booksOpen}
        books={booksQ.data ?? []}
        translation={currentMeta}
        initialBookSlug={initialBookSlug}
        recent={recent}
        onClose={() => {
          setBooksOpen(false);
          setInitialBookSlug(null);
        }}
        onPick={(bookSlug, chapter) => goToChapter(bookSlug, chapter)}
      />
    </div>
  );
}
