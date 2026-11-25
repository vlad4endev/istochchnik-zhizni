import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LuBookmark,
  LuBookOpen,
  LuChevronRight,
  LuNotebookPen,
  LuSearch,
  LuSparkles,
  LuX,
} from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { pluralizeRu } from '@/lib/pluralizeRu';

import {
  fetchBibleBooks,
  fetchBibleProgress,
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
import { VerseOfDayCard } from '../components/VerseOfDayCard';

export function BibleHomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ.trim());
  const [booksOpen, setBooksOpen] = useState(false);
  const [initialBookSlug, setInitialBookSlug] = useState<string | null>(null);
  const [tab, setTab] = useState<'nt' | 'ot'>('nt');
  const [recent, setRecent] = useState<BibleRecentItem[]>(() => readRecentBible());
  const [translation, setTranslation] = useState(() => readStoredTranslation('synodal'));

  const translationsQ = useQuery({
    queryKey: ['bible', 'translations'],
    queryFn: fetchBibleTranslations,
  });

  useEffect(() => {
    writeStoredTranslation(translation);
  }, [translation]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const currentMeta = (translationsQ.data ?? []).find((t) => t.code === translation) ?? null;
  const hasText = Boolean(currentMeta?.verse_count && currentMeta.verse_count > 0);

  const booksQ = useQuery({
    queryKey: ['bible', 'books', translation],
    queryFn: () => fetchBibleBooks(translation),
  });
  const progressQ = useQuery({
    queryKey: ['bible', 'progress', translation],
    queryFn: () => fetchBibleProgress(translation),
    enabled: hasText,
  });
  const searchQ = useQuery({
    queryKey: ['bible', 'search', translation, debouncedQ],
    queryFn: () => searchBible(debouncedQ, translation),
    enabled: debouncedQ.length >= 2 && hasText,
  });

  const books = booksQ.data ?? [];
  const ot = useMemo(() => books.filter((b) => b.testament === 'ot'), [books]);
  const nt = useMemo(() => books.filter((b) => b.testament === 'nt'), [books]);
  const showTabs = ot.length > 0 && currentMeta?.scope !== 'nt';
  const visibleBooks = tab === 'ot' && showTabs ? ot : nt;

  useEffect(() => {
    if (!showTabs && tab !== 'nt') setTab('nt');
  }, [showTabs, tab]);

  const progress = progressQ.data;
  const query = q.trim();
  const searching = query.length > 0;
  const refParsed = searching ? parseBibleRef(query) : null;
  const refBook = refParsed ? (books.find((b) => b.slug === refParsed.bookSlug) ?? null) : null;

  function rememberAndGo(bookSlug: string, chapter: number, verse?: number | null) {
    const book = books.find((b) => b.slug === bookSlug);
    setRecent(
      pushRecentBible({
        translation,
        translation_title: currentMeta?.title || translation,
        book_slug: bookSlug,
        book_name: book?.name || bookSlug,
        short_name: book?.short_name || bookSlug,
        chapter,
      }),
    );
    void navigate(
      `/bible/${translation}/${bookSlug}/${chapter}${verse != null ? `?v=${verse}` : ''}`,
    );
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (refParsed) {
      rememberAndGo(refParsed.bookSlug, refParsed.chapter, refParsed.verseStart);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-4 sm:px-5">
        <form onSubmit={onSearchSubmit} className="relative">
          <LuSearch
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            size={18}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск или ссылка: Ин 3:16"
            className="w-full rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] py-3 pl-10 pr-10 text-[15px] outline-none ring-primary/30 focus:ring-2"
          />
          {searching ? (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-stone-400 transition hover:text-stone-600"
            >
              <LuX size={16} />
            </button>
          ) : null}
        </form>

        {searching ? (
          <div className="mt-4 space-y-2">
            {refParsed ? (
              <button
                type="button"
                onClick={() => rememberAndGo(refParsed.bookSlug, refParsed.chapter, refParsed.verseStart)}
                className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-left text-white shadow-sm shadow-primary/25 transition hover:brightness-105 active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <LuBookOpen size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-white/70">
                    Перейти
                  </span>
                  <span className="block truncate text-[15px] font-bold">
                    {refBook?.name ?? refParsed.bookSlug} {refParsed.chapter}
                    {refParsed.verseStart != null ? `:${refParsed.verseStart}` : ''}
                  </span>
                </span>
                <LuChevronRight size={18} className="shrink-0 opacity-80" />
              </button>
            ) : null}

            {!refParsed && debouncedQ.length < 2 ? (
              <p className="px-1 pt-2 text-sm text-stone-400">Введите ещё символ — ищем по мере набора</p>
            ) : null}

            {!refParsed && debouncedQ.length >= 2 ? (
              <>
                {searchQ.isLoading ? (
                  <p className="px-1 pt-2 text-sm text-stone-400">Ищем…</p>
                ) : (searchQ.data ?? []).length === 0 ? (
                  <p className="px-1 pt-2 text-sm text-stone-500">Ничего не найдено</p>
                ) : (
                  (searchQ.data ?? []).map((hit) => (
                    <button
                      key={`${hit.book_slug}-${hit.chapter}-${hit.verse}`}
                      type="button"
                      onClick={() => rememberAndGo(hit.book_slug, hit.chapter, hit.verse)}
                      className="block w-full rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3 text-left transition hover:border-primary/30"
                    >
                      <p className="text-sm font-bold text-stone-900">
                        {hit.short_name} {hit.chapter}:{hit.verse}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">
                        {hit.text}
                      </p>
                    </button>
                  ))
                )}
              </>
            ) : null}
          </div>
        ) : (
          <>
            {hasText ? (
              <div className="mt-4">
                <VerseOfDayCard
                  translation={translation}
                  translationTitle={currentMeta?.short_title || currentMeta?.title || translation}
                />
              </div>
            ) : null}

            {progress && hasText ? (
              <button
                type="button"
                onClick={() => rememberAndGo(progress.book_slug, progress.chapter, progress.verse)}
                className="mt-4 flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br from-stone-800 to-stone-700 px-5 py-4 text-left text-white shadow-[var(--shadow)] transition active:scale-[0.99]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  <LuBookOpen size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-white/70">
                    Продолжить чтение
                  </span>
                  <span className="mt-0.5 block truncate text-lg font-bold">
                    {progress.short_name} {progress.chapter}:{progress.verse}
                  </span>
                </span>
                <LuChevronRight size={20} className="shrink-0 text-white/60" />
              </button>
            ) : hasText && books.length > 0 ? (
              <button
                type="button"
                onClick={() => rememberAndGo('john', 1)}
                className="mt-4 flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br from-stone-800 to-stone-700 px-5 py-4 text-left text-white shadow-[var(--shadow)] transition active:scale-[0.99]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  <LuBookOpen size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-white/70">
                    Начать чтение
                  </span>
                  <span className="mt-0.5 block truncate text-lg font-bold">
                    Евангелие от Иоанна
                  </span>
                </span>
                <LuChevronRight size={20} className="shrink-0 text-white/60" />
              </button>
            ) : null}

            {recent.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 px-0.5 text-xs font-bold uppercase tracking-wide text-stone-400">
                  Недавние
                </p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {recent.slice(0, 10).map((r) => (
                    <Link
                      key={`${r.translation}-${r.book_slug}-${r.chapter}-${r.at}`}
                      to={`/bible/${r.translation}/${r.book_slug}/${r.chapter}`}
                      className="shrink-0 rounded-full bg-stone-100 px-3.5 py-2 text-sm font-semibold text-stone-800 transition hover:bg-[#f3e8e4]"
                    >
                      {r.short_name} {r.chapter}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {/* app-mobile-sections-grid: иначе mobile.css схлопывает grid-cols-3 в одну колонку на телефоне */}
            <div className="app-mobile-sections-grid mt-4 grid grid-cols-3 gap-2">
              <Link
                to="/bible/notes"
                className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-2 py-3.5 text-center transition hover:border-primary/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LuNotebookPen size={17} />
                </span>
                <span className="block text-[13px] font-bold leading-tight text-stone-900">Заметки</span>
              </Link>
              <Link
                to="/bible/notes?tab=bookmarks"
                className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-2 py-3.5 text-center transition hover:border-primary/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <LuBookmark size={17} />
                </span>
                <span className="block text-[13px] font-bold leading-tight text-stone-900">Закладки</span>
              </Link>
              <Link
                to="/bible/plans"
                className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-2 py-3.5 text-center transition hover:border-primary/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LuSparkles size={17} />
                </span>
                <span className="block text-[13px] font-bold leading-tight text-stone-900">Планы</span>
              </Link>
            </div>

            <section className="mt-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-stone-900">Книги</h2>
                <TranslationPicker
                  compact
                  translations={translationsQ.data ?? []}
                  value={translation}
                  onChange={setTranslation}
                />
              </div>

              {showTabs ? (
                /* flex, не grid-cols-2: mobile.css на <640px принудительно сводит grid-cols-2 в одну колонку — сегмент-контрол обязан оставаться горизонтальным */
                <div className="mt-3 flex gap-1 rounded-2xl bg-stone-100 p-1">
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
              ) : null}

              {/* app-mobile-sections-grid: иначе mobile.css схлопывает сетку в одну колонку на телефоне — 66 книг «лентой» */}
              <div className="app-mobile-sections-grid mt-3 grid grid-cols-2 gap-2">
                {visibleBooks.map((b) => (
                  <button
                    key={b.slug}
                    type="button"
                    onClick={() => {
                      setInitialBookSlug(b.slug);
                      setBooksOpen(true);
                    }}
                    className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] px-3.5 py-3 text-left transition hover:border-primary/30 active:scale-[0.98]"
                  >
                    <span className="block truncate text-[15px] font-semibold text-stone-900">
                      {b.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-400">
                      {b.chapters_count} {pluralizeRu(b.chapters_count, ['глава', 'главы', 'глав'])}
                    </span>
                  </button>
                ))}
              </div>

              {books.length === 0 && !booksQ.isLoading ? (
                <p className="mt-3 text-sm text-stone-500">Книги пока недоступны</p>
              ) : null}
            </section>

            {!hasText && !booksQ.isLoading ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Текст перевода ещё не загружен</p>
                <p className="mt-1">
                  На сервере: <code>npm run bible:seed -- --translation={translation}</code>
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <BooksSheet
        open={booksOpen}
        books={books}
        translation={currentMeta}
        initialBookSlug={initialBookSlug}
        onClose={() => {
          setBooksOpen(false);
          setInitialBookSlug(null);
        }}
        onPick={(bookSlug, chapter) => rememberAndGo(bookSlug, chapter)}
      />
    </div>
  );
}
