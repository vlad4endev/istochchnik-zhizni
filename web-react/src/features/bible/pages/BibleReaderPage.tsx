import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuMessageSquareText,
  LuNotebookPen,
  LuX,
} from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';
import { useAuthStore } from '@/features/auth/authStore';

import {
  createBibleNote,
  createChurchCommentary,
  fetchBibleAudio,
  fetchBibleBooks,
  fetchBibleChapter,
  fetchBibleCommentaries,
  fetchBibleNotes,
  fetchBibleTranslations,
  saveBibleProgress,
} from '../api';
import {
  pushRecentBible,
  readRecentBible,
  writeStoredTranslation,
} from '../bibleUiMeta';
import { BooksSheet } from '../components/BooksSheet';
import { SyncedAudioPlayer } from '../components/SyncedAudioPlayer';
import { TranslationPicker } from '../components/TranslationPicker';

export function BibleReaderPage() {
  const { translation = 'synodal', book = 'john', chapter: chapterParam } = useParams();
  const chapter = Math.max(1, Number(chapterParam) || 1);
  const [search] = useSearchParams();
  const focusVerse = search.get('v') != null ? Number(search.get('v')) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.roles ?? []);
  const role = useAuthStore((s) => s.role);
  const canChurchComment = [role, ...roles].some((r) =>
    ['admin', 'pastor', 'editor', 'minister'].includes(String(r ?? '').toLowerCase()),
  );

  const [selectedVerse, setSelectedVerse] = useState<number | null>(focusVerse);
  const [activeAudioVerse, setActiveAudioVerse] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [booksOpen, setBooksOpen] = useState(false);
  const [recent, setRecent] = useState(() => readRecentBible());
  const [noteBody, setNoteBody] = useState('');
  const [churchBody, setChurchBody] = useState('');
  const verseRefs = useRef<Map<number, HTMLElement>>(new Map());

  const translationsQ = useQuery({
    queryKey: ['bible', 'translations'],
    queryFn: fetchBibleTranslations,
  });
  const chapterQ = useQuery({
    queryKey: ['bible', 'chapter', translation, book, chapter],
    queryFn: () => fetchBibleChapter(translation, book, chapter),
  });
  const booksQ = useQuery({
    queryKey: ['bible', 'books', translation],
    queryFn: () => fetchBibleBooks(translation),
  });
  const translationMeta = (translationsQ.data ?? []).find((t) => t.code === translation);
  const notesQ = useQuery({
    queryKey: ['bible', 'notes', translation, book, chapter],
    queryFn: () => fetchBibleNotes({ translation, book, chapter }),
  });
  const commentsQ = useQuery({
    queryKey: ['bible', 'comments', translation, book, chapter],
    queryFn: () => fetchBibleCommentaries(translation, book, chapter),
  });
  const audioQ = useQuery({
    queryKey: ['bible', 'audio', translation, book, chapter],
    queryFn: () => fetchBibleAudio(translation, book, chapter),
  });

  const bookMeta = useMemo(
    () => (booksQ.data ?? []).find((b) => b.slug === book) ?? chapterQ.data?.book,
    [booksQ.data, book, chapterQ.data?.book],
  );

  useEffect(() => {
    writeStoredTranslation(translation);
  }, [translation]);

  useEffect(() => {
    if (!chapterQ.data?.verses.length) return;
    const verse = focusVerse && focusVerse > 0 ? focusVerse : 1;
    void saveBibleProgress({
      translation,
      book_slug: book,
      chapter,
      verse,
    }).catch(() => undefined);
  }, [translation, book, chapter, focusVerse, chapterQ.data?.verses.length]);

  useEffect(() => {
    if (!bookMeta || !translationMeta) return;
    setRecent(
      pushRecentBible({
        translation,
        translation_title: translationMeta.title,
        book_slug: bookMeta.slug,
        book_name: bookMeta.name,
        short_name: bookMeta.short_name,
        chapter,
      }),
    );
  }, [
    translation,
    chapter,
    bookMeta?.slug,
    bookMeta?.name,
    bookMeta?.short_name,
    translationMeta?.title,
  ]);

  useEffect(() => {
    if (focusVerse == null) return;
    const el = verseRefs.current.get(focusVerse);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusVerse, chapterQ.data?.verses]);

  useEffect(() => {
    if (activeAudioVerse == null) return;
    const el = verseRefs.current.get(activeAudioVerse);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeAudioVerse]);

  const createNoteMut = useMutation({
    mutationFn: () =>
      createBibleNote({
        translation,
        book_slug: book,
        chapter,
        verse_start: selectedVerse ?? 1,
        body: noteBody,
      }),
    onSuccess: () => {
      setNoteBody('');
      void qc.invalidateQueries({ queryKey: ['bible', 'notes', translation, book, chapter] });
      emitAppToast('Заметка сохранена', 'success');
    },
    onError: () => emitAppToast('Не удалось сохранить заметку', 'error'),
  });

  const churchMut = useMutation({
    mutationFn: () =>
      createChurchCommentary({
        translation,
        book_slug: book,
        chapter,
        verse_start: selectedVerse ?? undefined,
        body: churchBody,
      }),
    onSuccess: () => {
      setChurchBody('');
      void qc.invalidateQueries({ queryKey: ['bible', 'comments', translation, book, chapter] });
      emitAppToast('Комментарий добавлен', 'success');
    },
    onError: () => emitAppToast('Не удалось добавить комментарий', 'error'),
  });

  const prevChapter = chapter > 1 ? chapter - 1 : null;
  const nextChapter =
    bookMeta && chapter < bookMeta.chapters_count ? chapter + 1 : null;

  const highlightVerse = activeAudioVerse ?? selectedVerse ?? focusVerse;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <TranslationPicker
            compact
            translations={translationsQ.data ?? []}
            value={translation}
            onChange={(code) => {
              writeStoredTranslation(code);
              void navigate(
                `/bible/${code}/${book}/${chapter}${focusVerse != null ? `?v=${focusVerse}` : ''}`,
              );
            }}
          />
          <button
            type="button"
            onClick={() => setBooksOpen(true)}
            className="inline-flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-left"
          >
            <span className="truncate text-sm font-bold text-stone-900">
              {bookMeta ? `${bookMeta.name} ${chapter}` : 'Книга'}
            </span>
            <LuChevronDown size={16} className="shrink-0 text-stone-400" />
          </button>
        </div>

        {audioQ.data ? (
          <SyncedAudioPlayer
            audio={audioQ.data}
            onActiveVerse={setActiveAudioVerse}
            seekVerse={sheetOpen ? selectedVerse : null}
          />
        ) : null}

        {chapterQ.isLoading ? (
          <p className="text-sm text-stone-500">Загрузка…</p>
        ) : chapterQ.data?.verses.length === 0 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Текст главы отсутствует. Загрузка:{' '}
            <code>npm run bible:seed -- --translation={translationMeta?.code || translation}</code>
          </p>
        ) : (
          <div className="space-y-1 pb-36 font-serif text-[17px] leading-8 text-stone-900 sm:text-[18px] lg:pb-24">
            {(chapterQ.data?.verses ?? []).map((v) => {
              const active = highlightVerse === v.verse;
              return (
                <p
                  key={v.verse}
                  ref={(el) => {
                    if (el) verseRefs.current.set(v.verse, el);
                  }}
                  className={[
                    'cursor-pointer rounded-xl px-2 py-1 transition',
                    active ? 'bg-amber-100/90' : 'hover:bg-stone-100/80',
                  ].join(' ')}
                  onClick={() => {
                    setSelectedVerse(v.verse);
                    setSheetOpen(true);
                  }}
                >
                  <sup className="mr-1 select-none text-[11px] font-sans font-bold text-primary">
                    {v.verse}
                  </sup>
                  {v.text}
                </p>
              );
            })}
          </div>
        )}

        {(commentsQ.data ?? []).length > 0 ? (
          <section className="space-y-2 border-t border-stone-200 pb-28 pt-4 lg:pb-16">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-stone-500">
              <LuMessageSquareText size={14} /> Комментарии
            </h2>
            {(commentsQ.data ?? []).map((c) => (
              <article
                key={c.id}
                className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  {c.source === 'lopukhin' ? 'Лопухин' : 'Церковь'}
                  {c.verse_start != null ? ` · ст. ${c.verse_start}` : ''}
                </p>
                {c.title ? <p className="mt-1 font-semibold text-stone-900">{c.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{c.body}</p>
              </article>
            ))}
          </section>
        ) : null}
      </div>

      <BooksSheet
        open={booksOpen}
        books={booksQ.data ?? []}
        translation={translationMeta ?? null}
        currentBookSlug={book}
        recent={recent}
        onClose={() => setBooksOpen(false)}
        onPick={(bookSlug, nextChapterNum) => {
          void navigate(`/bible/${translation}/${bookSlug}/${nextChapterNum}`);
        }}
      />

      {/* Главы: круглые кнопки по краям снизу, над таб-баром (как в «Библия») */}
      {!sheetOpen && !booksOpen ? (
        <div className="pointer-events-none fixed inset-x-0 z-[90] flex items-end justify-between px-3 sm:px-4 lg:px-8 bottom-[calc(var(--app-bottom-nav-total-height)+0.55rem)] lg:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            aria-label="Предыдущая глава"
            disabled={prevChapter == null}
            onClick={() =>
              prevChapter != null && navigate(`/bible/${translation}/${book}/${prevChapter}`)
            }
            className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-stone-200/90 bg-white/95 text-stone-800 shadow-[0_6px_20px_rgba(28,25,23,0.14)] backdrop-blur transition active:scale-95 disabled:pointer-events-none disabled:opacity-0 lg:h-11 lg:w-11"
          >
            <LuChevronLeft size={22} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Следующая глава"
            disabled={nextChapter == null}
            onClick={() =>
              nextChapter != null && navigate(`/bible/${translation}/${book}/${nextChapter}`)
            }
            className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-stone-200/90 bg-white/95 text-stone-800 shadow-[0_6px_20px_rgba(28,25,23,0.14)] backdrop-blur transition active:scale-95 disabled:pointer-events-none disabled:opacity-0 lg:h-11 lg:w-11"
          >
            <LuChevronRight size={22} strokeWidth={2.25} />
          </button>
        </div>
      ) : null}

      {sheetOpen && selectedVerse != null ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl rounded-t-3xl border border-stone-200 bg-[var(--surface-elevated)] p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold text-stone-900">
              {bookMeta?.short_name} {chapter}:{selectedVerse}
            </p>
            <button type="button" aria-label="Закрыть" onClick={() => setSheetOpen(false)}>
              <LuX size={20} className="text-stone-500" />
            </button>
          </div>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            placeholder="Личная заметка…"
            className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!noteBody.trim() || createNoteMut.isPending}
              onClick={() => createNoteMut.mutate()}
            >
              <LuNotebookPen size={16} /> Сохранить заметку
            </button>
            <Link to="/bible/notes" className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600">
              Все заметки
            </Link>
          </div>
          {(notesQ.data ?? [])
            .filter((n) => n.verse_start <= selectedVerse && n.verse_end >= selectedVerse)
            .map((n) => (
              <p key={n.id} className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">
                {n.body}
              </p>
            ))}
          {canChurchComment ? (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <textarea
                value={churchBody}
                onChange={(e) => setChurchBody(e.target.value)}
                rows={2}
                placeholder="Церковный комментарий…"
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="mt-2 rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-semibold"
                disabled={!churchBody.trim() || churchMut.isPending}
                onClick={() => churchMut.mutate()}
              >
                Опубликовать комментарий
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
