import { LuChevronRight, LuPause, LuPlay } from 'react-icons/lu';

import { useBibleAudioStore } from '../bibleAudioStore';

type Props = {
  translation: string;
  bookSlug: string;
  chapter: number;
  title: string;
  translationTitle: string;
  onPlay: () => void;
};

/**
 * Компактная строка «Слушать главу» в читалке. Живая: когда глава играет,
 * показывает эквалайзер; тап по строке переключает play/pause,
 * шеврон открывает полную шторку плеера.
 */
export function ChapterListenRow({
  translation,
  bookSlug,
  chapter,
  title,
  translationTitle,
  onPlay,
}: Props) {
  const track = useBibleAudioStore((s) => s.track);
  const status = useBibleAudioStore((s) => s.status);
  const toggle = useBibleAudioStore((s) => s.toggle);
  const setSheetOpen = useBibleAudioStore((s) => s.setSheetOpen);

  const isCurrent =
    track != null &&
    track.translation === translation &&
    track.bookSlug === bookSlug &&
    track.chapter === chapter;
  const playing = isCurrent && status === 'playing';

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-2.5 shadow-sm">
      <style>{EQ_CSS}</style>
      <button
        type="button"
        onClick={() => (isCurrent ? toggle() : onPlay())}
        aria-label={playing ? 'Пауза' : 'Слушать главу'}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md shadow-primary/25 transition active:scale-95"
      >
        {playing ? (
          <span className="bible-eq" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        ) : (
          <LuPlay size={18} className="ml-0.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => (isCurrent ? toggle() : onPlay())}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-bold text-stone-900">
          {playing ? (
            <span className="inline-flex items-center gap-1.5">
              Сейчас играет <LuPause size={12} className="text-primary" />
            </span>
          ) : (
            'Слушать главу'
          )}
        </span>
        <span className="block truncate text-xs text-stone-500">
          {title} · {translationTitle}
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          if (!isCurrent) onPlay();
          setSheetOpen(true);
        }}
        aria-label="Открыть плеер"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
      >
        <LuChevronRight size={18} />
      </button>
    </div>
  );
}

const EQ_CSS = `
.bible-eq { display: inline-flex; align-items: flex-end; gap: 2.5px; height: 16px; }
.bible-eq > span { width: 3px; border-radius: 2px; background: #fff; animation: bible-eq-bounce 0.9s ease-in-out infinite; }
.bible-eq > span:nth-child(2) { animation-delay: 0.22s; }
.bible-eq > span:nth-child(3) { animation-delay: 0.45s; }
@keyframes bible-eq-bounce { 0%, 100% { height: 5px; } 50% { height: 16px; } }
`;
