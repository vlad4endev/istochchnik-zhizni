import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LuBookMarked, LuNotebookPen, LuSearch, LuSparkles } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';

import { fetchBibleBooks, fetchBibleProgress, fetchBiblePlans, searchBible } from '../api';
import { parseBibleRef } from '../bibleRef';

const TRANSLATION = 'synodal';

export function BibleHomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [submitted, setSubmitted] = useState(initialQ);

  const booksQ = useQuery({
    queryKey: ['bible', 'books', TRANSLATION],
    queryFn: () => fetchBibleBooks(TRANSLATION),
  });
  const progressQ = useQuery({
    queryKey: ['bible', 'progress', TRANSLATION],
    queryFn: () => fetchBibleProgress(TRANSLATION),
  });
  const plansQ = useQuery({
    queryKey: ['bible', 'plans'],
    queryFn: fetchBiblePlans,
  });
  const searchQ = useQuery({
    queryKey: ['bible', 'search', TRANSLATION, submitted],
    queryFn: () => searchBible(submitted, TRANSLATION),
    enabled: submitted.trim().length >= 2,
  });

  const ot = useMemo(() => (booksQ.data ?? []).filter((b) => b.testament === 'ot'), [booksQ.data]);
  const nt = useMemo(() => (booksQ.data ?? []).filter((b) => b.testament === 'nt'), [booksQ.data]);
  const progress = progressQ.data;

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    const parsed = parseBibleRef(trimmed);
    if (parsed) {
      const path = `/bible/${TRANSLATION}/${parsed.bookSlug}/${parsed.chapter}${
        parsed.verseStart != null ? `?v=${parsed.verseStart}` : ''
      }`;
      void navigate(path);
      return;
    }
    setSubmitted(trimmed);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-5 sm:px-5">
        {progress ? (
          <Link
            to={`/bible/${TRANSLATION}/${progress.book_slug}/${progress.chapter}?v=${progress.verse}`}
            className="block rounded-3xl bg-gradient-to-br from-stone-800 to-stone-700 px-5 py-4 text-white shadow-[var(--shadow)]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Продолжить чтение</p>
            <p className="mt-1 text-lg font-bold">
              {progress.short_name} {progress.chapter}:{progress.verse}
            </p>
            <p className="mt-0.5 text-sm text-white/80">{progress.book_name}</p>
          </Link>
        ) : null}

        <form onSubmit={onSearchSubmit} className="relative">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск или ссылка: Ин 3:16"
            className="w-full rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] py-3 pl-10 pr-4 text-[15px] outline-none ring-primary/30 focus:ring-2"
          />
        </form>

        {submitted.trim().length >= 2 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-stone-500">Результаты</p>
            {(searchQ.data ?? []).length === 0 && !searchQ.isLoading ? (
              <p className="text-sm text-stone-500">Ничего не найдено</p>
            ) : null}
            {(searchQ.data ?? []).map((hit) => (
              <Link
                key={`${hit.book_slug}-${hit.chapter}-${hit.verse}`}
                to={`/bible/${TRANSLATION}/${hit.book_slug}/${hit.chapter}?v=${hit.verse}`}
                className="block rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
              >
                <p className="text-sm font-bold text-stone-900">
                  {hit.short_name} {hit.chapter}:{hit.verse}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-600 line-clamp-2">{hit.text}</p>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
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

        {(plansQ.data ?? []).slice(0, 3).map((plan) => (
          <Link
            key={plan.id}
            to={`/bible/plans/${plan.id}`}
            className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
          >
            <p className="font-bold text-stone-900">{plan.title}</p>
            {plan.goal ? <p className="mt-1 text-sm text-stone-600 line-clamp-2">{plan.goal}</p> : null}
          </Link>
        ))}

        <BookSection title="Новый Завет" books={nt} />
        <BookSection title="Ветхий Завет" books={ot} />

        {(booksQ.data ?? []).length === 0 && !booksQ.isLoading ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Текст Библии ещё не загружен</p>
            <p className="mt-1">На сервере выполните: <code>npm run bible:seed</code> (или <code>bible:seed:sample</code>).</p>
          </div>
        ) : null}

        <p className="pb-8 text-center text-xs text-stone-400">
          <LuBookMarked className="mr-1 inline" size={12} />
          Синодальный перевод · общественное достояние
        </p>
      </div>
    </div>
  );
}

function BookSection({
  title,
  books,
}: {
  title: string;
  books: Array<{ slug: string; name: string; short_name: string; chapters_count: number }>;
}) {
  if (books.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {books.map((b) => (
          <Link
            key={b.slug}
            to={`/bible/${TRANSLATION}/${b.slug}/1`}
            className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-3 py-3 transition hover:border-primary/40"
          >
            <p className="text-sm font-bold text-stone-900">{b.short_name}</p>
            <p className="mt-0.5 truncate text-xs text-stone-500">{b.name}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
