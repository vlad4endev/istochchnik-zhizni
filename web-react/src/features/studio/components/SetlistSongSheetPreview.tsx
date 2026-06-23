import type { StudioSheetMeta } from '../api';
import { SheetMusicScoreViewer } from './SheetMusicScoreViewer';
import { LyricsWithMusicianNotes } from './LyricsWithMusicianNotes';
import { notesFromItem, type MusicianNotesV1 } from '../performNotes';

type Props = {
  content: string;
  sheetContent?: string | null;
  musicianNotes?: MusicianNotesV1 | null;
  songTitle?: string | null;
  songKey?: string | null;
  sheetKey?: string | null;
  tempo?: number | null;
  timeSignature?: string | null;
  sheetMeta?: StudioSheetMeta | null;
  compact?: boolean;
};

/** Просмотр «нот» песни в сетлисте: партитура (ABC/фото) или текст с аккордами. */
export function SetlistSongSheetPreview({
  content,
  sheetContent,
  musicianNotes,
  songTitle,
  songKey,
  sheetKey,
  tempo,
  timeSignature,
  sheetMeta,
  compact = false,
}: Props) {
  const hasSheet = Boolean(sheetContent?.trim()) || Boolean(sheetMeta?.abcNotation) || Boolean(sheetMeta?.sourceImageUrl);
  const displayKey = sheetKey?.trim() || songKey;
  const notes = notesFromItem(musicianNotes);
  const hasMusicianNotes =
    (notes.lineComments && Object.keys(notes.lineComments).length > 0) ||
    (notes.blockComments && notes.blockComments.length > 0);

  if (hasSheet) {
    return (
      <div className="space-y-3">
        {hasMusicianNotes ? (
          <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
            есть заметки для музыкантов
          </span>
        ) : null}
        <SheetMusicScoreViewer
          sheetMeta={sheetMeta}
          songTitle={songTitle}
          songKey={displayKey}
          tempo={tempo}
          timeSignature={timeSignature}
          fallbackContent={sheetContent || content}
          compact={compact}
        />
        {hasMusicianNotes ? (
          <LyricsWithMusicianNotes
            content={content}
            notes={notes}
            transposeSemitones={0}
            chordTone="light"
            stageDark={false}
            fontSizePx={compact ? 14 : 15}
            chordsVisible
            notesVisible
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-[var(--text-secondary)]"
          />
        ) : null}
      </div>
    );
  }

  const body = content?.trim() ?? '';
  if (!body) {
    return (
      <p className="py-3 text-sm text-[var(--text-muted)]">
        Текст и ноты пока не добавлены — откройте редактор студии.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        {displayKey ? (
          <span>
            Тональность: <span className="font-mono font-semibold text-[var(--text)]">{displayKey}</span>
          </span>
        ) : null}
        {tempo ? <span>BPM: {tempo}</span> : null}
        {timeSignature ? <span>Размер: {timeSignature}</span> : null}
        {hasMusicianNotes ? (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800">
            есть заметки
          </span>
        ) : null}
      </div>
      <LyricsWithMusicianNotes
        content={body}
        notes={notes}
        transposeSemitones={0}
        chordTone="light"
        stageDark={false}
        fontSizePx={compact ? 15 : 16}
        chordsVisible
        notesVisible
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-[var(--text-secondary)]"
      />
    </div>
  );
}
