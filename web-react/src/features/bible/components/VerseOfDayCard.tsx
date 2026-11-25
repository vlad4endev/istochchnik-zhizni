import { useQuery } from '@tanstack/react-query';
import { LuChevronRight, LuShare2, LuSparkles } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';

import { emitAppToast } from '@/lib/uiFeedback';

import { fetchBibleChapter } from '../api';
import { pickVerseOfDay } from '../verseOfDay';

type Props = {
  translation: string;
  translationTitle: string;
};

/** Карточка «Стих дня» на главной Библии — как в YouVersion. */
export function VerseOfDayCard({ translation, translationTitle }: Props) {
  const navigate = useNavigate();
  const ref = pickVerseOfDay();

  const chapterQ = useQuery({
    queryKey: ['bible', 'vod', translation, ref.book, ref.chapter],
    queryFn: () => fetchBibleChapter(translation, ref.book, ref.chapter),
    staleTime: 12 * 60 * 60 * 1000,
  });

  if (!chapterQ.data) return null;

  const end = ref.end ?? ref.verse;
  const text = (chapterQ.data.verses ?? [])
    .filter((v) => v.verse >= ref.verse && v.verse <= end)
    .map((v) => v.text)
    .join(' ');
  if (!text) return null;

  const bookName = chapterQ.data.book?.name ?? ref.book;
  const shortName = chapterQ.data.book?.short_name ?? ref.book;
  const refLabel = `${shortName} ${ref.chapter}:${ref.verse}${end > ref.verse ? `–${end}` : ''}`;
  const shareText = `«${text}» — ${refLabel} (${translationTitle})`;

  function openContext() {
    void navigate(`/bible/${translation}/${ref.book}/${ref.chapter}?v=${ref.verse}`);
  }

  function share(e: React.MouseEvent) {
    e.stopPropagation();
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: `Стих дня — ${refLabel}`, text: shareText }).catch(() => undefined);
    } else {
      void navigator.clipboard.writeText(shareText).then(
        () => emitAppToast('Стих скопирован', 'success'),
        () => emitAppToast('Не удалось скопировать', 'error'),
      );
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openContext}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openContext();
      }}
      className="relative cursor-pointer overflow-hidden rounded-3xl bg-gradient-to-br from-[#7d3640] to-[#582229] px-5 py-4 text-white shadow-[0_14px_36px_rgba(88,34,41,0.35)] transition active:scale-[0.99]"
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.07]" />
      <div className="pointer-events-none absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-white/[0.05]" />
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/70">
          <LuSparkles size={13} /> Стих дня
        </p>
        <button
          type="button"
          onClick={share}
          aria-label="Поделиться стихом дня"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <LuShare2 size={15} />
        </button>
      </div>
      <p className="mt-2.5 font-serif text-[17px] leading-relaxed">{text}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white/90">{refLabel}</p>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-white/70">
          {bookName} {ref.chapter} <LuChevronRight size={13} />
        </span>
      </div>
    </div>
  );
}
