import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCopy,
  LuMessageSquareText,
  LuNotebookPen,
  LuPlay,
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
  BIBLE_FONT_SIZES,
  pushRecentBible,
  readBibleFontSize,
  writeBibleFontSize,
  writeStoredTranslation,
} from '../bibleUiMeta';
import { BibleSheetShell } from '../components/BibleSheetShell';
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

  // Приход по ?v= только подсвечивает стих (highlightVerse ниже) — панель действий
  // открывается лишь по явному тапу, иначе она закрывает текст при переходе из поиска.
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [activeAudioVerse, setActiveAudioVerse] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [booksOpen, setBooksOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => readBibleFontSize());
  const [noteBody, setNoteBody] = useState('');
  const [churchBody, setChurchBody] = useState('');
  /** Стих, с которого запустили озвучку кнопкой «Слушать» (null — не перематывать). */
  const [listenVerse, setListenVerse] = useState<number | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);
  const verseRefs = useRef<Map<number, HTMLElement>>(new Map());
  const commentsRef = useRef<HTMLElement | null>(null);

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

  /** Стихи, к которым есть личные заметки — помечаем точкой в тексте. */
  const notedVerses = useMemo(() => {
    const set = new Set<number>();
    for (const n of notesQ.data ?? []) {
      for (let v = n.verse_start; v <= n.verse_end; v += 1) set.add(v);
    }
    return set;
  }, [notesQ.data]);

  useEffect(() => {
    writeStoredTranslation(translation);
  }, [translation]);

  useEffect(() => {
    writeBibleFontSize(fontSize);
  }, [fontSize]);

  // Новая глава/книга/перевод — сбрасываем выделение стиха и подсветку озвучки,
  // иначе панель действий показывала бы стих из предыдущей главы.
  useEffect(() => {
    setSelectedVerse(null);
    setActiveAudioVerse(null);
    setListenVerse(null);
  }, [translation, book, chapter]);

  // Приход по ?play=1 (автопереход на следующую главу): запускаем озвучку
  // с начала главы и убираем параметр, чтобы перезагрузка не включала звук снова.
  const wantPlay = search.get('play') === '1';
  useEffect(() => {
    if (!wantPlay || !audioQ.data) return;
    setListenVerse(1);
    setSeekNonce((n) => n + 1);
    const rest = new URLSearchParams(search);
    rest.delete('play');
    const qs = rest.toString();
    navigate(`/bible/${translation}/${book}/${chapter}${qs ? `?${qs}` : ''}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantPlay, audioQ.data]);

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
    pushRecentBible({
      translation,
      translation_title: translationMeta.title,
      book_slug: bookMeta.slug,
      book_name: bookMeta.name,
      short_name: bookMeta.short_name,
      chapter,
    });
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
      setNoteOpen(false);
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
  const nextChapter = bookMeta && chapter < bookMeta.chapters_count ? chapter + 1 : null;

  /** Куда переходить, когда озвучка главы закончилась: следующая глава или начало следующей книги. */
  const audioNextTarget = useMemo(() => {
    if (nextChapter != null) return { book, chapter: nextChapter };
    const books = booksQ.data ?? [];
    const idx = books.findIndex((b) => b.slug === book);
    const nextBook = idx >= 0 ? books[idx + 1] : undefined;
    return nextBook ? { book: nextBook.slug, chapter: 1 } : null;
  }, [nextChapter, book, booksQ.data]);

  function handleAudioAutoNext() {
    if (!audioNextTarget) return;
    void navigate(`/bible/${translation}/${audioNextTarget.book}/${audioNextTarget.chapter}?play=1`);
  }

  const highlightVerse = activeAudioVerse ?? selectedVerse ?? focusVerse;
  const selectedText =
    selectedVerse != null
      ? (chapterQ.data?.verses ?? []).find((v) => v.verse === selectedVerse)?.text ?? ''
      : '';
  const verseNotes = (notesQ.data ?? []).filter(
    (n) => selectedVerse != null && n.verse_start <= selectedVerse && n.verse_end >= selectedVerse,
  );
  const commentsCount = (commentsQ.data ?? []).length;
  const hasAudio = Boolean(audioQ.data && !audioQ.data.audio_url.endsWith('.json'));
  const fontIdx = (BIBLE_FONT_SIZES as readonly number[]).indexOf(fontSize);

  function bumpFont(delta: 1 | -1) {
    const next = BIBLE_FONT_SIZES[fontIdx + delta];
    if (next != null) setFontSize(next);
  }

  function copySelectedVerse() {
    if (selectedVerse == null || !selectedText) return;
    const ref = `${bookMeta?.short_name ?? book} ${chapter}:${selectedVerse}`;
    const text = `«${selectedText}» — ${ref} (${translationMeta?.short_title || translationMeta?.title || translation})`;
    void navigator.clipboard.writeText(text).then(
      () => emitAppToast('Стих скопирован', 'success'),
      () => emitAppToast('Не удалось скопировать', 'error'),
    );
  }

  function listenFromSelected() {
    if (selectedVerse == null) return;
    setListenVerse(selectedVerse);
    setSeekNonce((n) => n + 1);
  }

  const chromeOpen = noteOpen || booksOpen;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4 sm:px-5">
        <div className="sticky top-12 z-10 -mx-4 border-b border-stone-200/60 bg-[var(--surface)] px-4 py-2 sm:-mx-5 sm:px-5">
          <div className="flex items-center gap-2">
            <Link
              to="/bible"
              aria-label="К списку книг"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition active:scale-95"
            >
              <LuChevronLeft size={18} />
            </Link>
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
                {bookMeta ? `${bookMeta.name} ${chapter}` : 'Глава'}
              </span>
              <LuChevronDown size={16} className="shrink-0 text-stone-400" />
            </button>
            <div className="flex shrink-0 items-center rounded-full border border-stone-200 bg-white">
              <button
                type="button"
                aria-label="Уменьшить шрифт"
                disabled={fontIdx <= 0}
                onClick={() => bumpFont(-1)}
                className="px-2 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-30"
              >
                A−
              </button>
              <span className="h-4 w-px bg-stone-200" aria-hidden />
              <button
                type="button"
                aria-label="Увеличить шрифт"
                disabled={fontIdx < 0 || fontIdx >= BIBLE_FONT_SIZES.length - 1}
                onClick={() => bumpFont(1)}
                className="px-2 py-1.5 text-base font-bold text-stone-700 disabled:opacity-30"
              >
                A+
              </button>
            </div>
          </div>
        </div>

        {audioQ.data ? (
          <div className="mt-3">
            <SyncedAudioPlayer
              audio={audioQ.data}
              title={bookMeta ? `${bookMeta.name} ${chapter}` : undefined}
              onActiveVerse={setActiveAudioVerse}
              seekVerse={listenVerse}
              seekNonce={seekNonce}
              onAutoNext={handleAudioAutoNext}
            />
          </div>
        ) : null}

        {chapterQ.isLoading ? (
          <p className="mt-4 text-sm text-stone-500">Загрузка…</p>
        ) : chapterQ.isError ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-6 text-center">
            <p className="text-sm font-semibold text-stone-800">Глава не найдена</p>
            <p className="mt-1 text-sm text-stone-500">
              Проверьте ссылку или выберите книгу из списка.
            </p>
            <Link
              to="/bible"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              <LuChevronLeft size={15} /> К списку книг
            </Link>
          </div>
        ) : chapterQ.data?.verses.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Текст главы отсутствует. Загрузка:{' '}
            <code>npm run bible:seed -- --translation={translationMeta?.code || translation}</code>
          </p>
        ) : (
          <>
            <h1 className="mt-4 font-serif text-[22px] font-bold text-stone-900">
              {bookMeta?.name} {chapter}
            </h1>
            {commentsCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  commentsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-[#f3e8e4]"
              >
                <LuMessageSquareText size={13} />
                {commentsCount}{' '}
                {commentsCount === 1 ? 'комментарий' : commentsCount < 5 ? 'комментария' : 'комментариев'}
              </button>
            ) : null}
            <div
              className="mt-2 space-y-1 pb-44 font-serif text-stone-900 lg:pb-32"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
            >
              {(chapterQ.data?.verses ?? []).map((v) => {
                const active = highlightVerse === v.verse;
                const selected = selectedVerse === v.verse;
                return (
                  <p
                    key={v.verse}
                    ref={(el) => {
                      if (el) verseRefs.current.set(v.verse, el);
                    }}
                    className={[
                      'cursor-pointer rounded-xl px-2 py-1 transition',
                      selected
                        ? 'bg-amber-100/90 ring-1 ring-amber-300'
                        : active
                          ? 'bg-amber-100/90'
                          : 'hover:bg-stone-100/80',
                    ].join(' ')}
                    onClick={() => {
                      setSelectedVerse(selected ? null : v.verse);
                    }}
                  >
                    <sup className="mr-1 select-none font-sans text-[0.6em] font-bold text-primary">
                      {v.verse}
                    </sup>
                    {notedVerses.has(v.verse) ? (
                      <span
                        aria-label="Есть заметка"
                        title="Есть заметка"
                        className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-super"
                      />
                    ) : null}
                    {v.text}
                  </p>
                );
              })}
            </div>
          </>
        )}

        {commentsCount > 0 ? (
          <section
            ref={(el) => {
              commentsRef.current = el;
            }}
            className="space-y-2 border-t border-stone-200 pb-32 pt-4 lg:pb-20"
          >
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-stone-500">
              <LuMessageSquareText size={14} /> Комментарии · {commentsCount}
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
        onClose={() => setBooksOpen(false)}
        onPick={(bookSlug, nextChapterNum) => {
          setSelectedVerse(null);
          void navigate(`/bible/${translation}/${bookSlug}/${nextChapterNum}`);
        }}
      />

      {/* Действия с выбранным стихом: компактная панель над таб-баром */}
      {selectedVerse != null && !chromeOpen ? (
        <div className="fixed inset-x-0 z-[95] flex justify-center px-3 bottom-[calc(var(--app-bottom-nav-total-height)+0.55rem)] lg:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <div className="w-full max-w-md rounded-3xl border border-stone-200/90 bg-white/95 p-2 shadow-[0_10px_36px_rgba(28,25,23,0.18)] backdrop-blur">
            <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-0.5">
              <p className="min-w-0 truncate text-sm font-bold text-stone-900">
                {bookMeta?.short_name} {chapter}:{selectedVerse}
              </p>
              <button
                type="button"
                aria-label="Снять выбор"
                onClick={() => setSelectedVerse(null)}
                className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-stone-400 transition hover:text-stone-600"
              >
                Отмена
              </button>
            </div>
            {/* flex, не grid-cols-*: mobile.css на <640px сводит их в колонку — кнопки действий должны оставаться в ряд */}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-stone-800 transition hover:bg-stone-100 active:scale-[0.97]"
              >
                <LuNotebookPen size={19} className="text-primary" />
                <span className="text-[11px] font-semibold">Заметка</span>
              </button>
              {hasAudio ? (
                <button
                  type="button"
                  onClick={listenFromSelected}
                  className="flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-stone-800 transition hover:bg-stone-100 active:scale-[0.97]"
                >
                  <LuPlay size={19} className="text-primary" />
                  <span className="text-[11px] font-semibold">Слушать</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={copySelectedVerse}
                className="flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-stone-800 transition hover:bg-stone-100 active:scale-[0.97]"
              >
                <LuCopy size={19} className="text-primary" />
                <span className="text-[11px] font-semibold">Копировать</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Главы: круглые кнопки по краям снизу, над таб-баром; только при загруженной главе */}
      {selectedVerse == null && !chromeOpen && chapterQ.data ? (
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

      <BibleSheetShell
        open={noteOpen && selectedVerse != null}
        title={`${bookMeta?.short_name ?? ''} ${chapter}:${selectedVerse ?? ''}`}
        onClose={() => setNoteOpen(false)}
      >
        <div className="p-4">
          {selectedText ? (
            <p className="mb-3 rounded-2xl bg-stone-50 px-3.5 py-3 font-serif text-[15px] leading-relaxed text-stone-800">
              <sup className="mr-1 font-sans text-[10px] font-bold text-primary">{selectedVerse}</sup>
              {selectedText}
            </p>
          ) : null}
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            placeholder="Личная заметка…"
            className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:ring-2"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
          {verseNotes.map((n) => (
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
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:ring-2"
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
      </BibleSheetShell>
    </div>
  );
}
