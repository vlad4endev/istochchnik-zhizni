import { LyricsWithMusicianNotes } from './LyricsWithMusicianNotes';
import { notesFromItem, type MusicianNotesV1 } from '../performNotes';

type Props = {
  content: string;
  musicianNotes?: MusicianNotesV1 | null;
  songKey?: string | null;
  tempo?: number | null;
  timeSignature?: string | null;
  compact?: boolean;
};

/** Просмотр «нот» песни в сетлисте: аккорды, текст, заметки для музыкантов. */
export function SetlistSongSheetPreview({
  content,
  musicianNotes,
  songKey,
  tempo,
  timeSignature,
  compact = false,
}: Props) {
  const body = content?.trim() ?? '';
  const notes = notesFromItem(musicianNotes);
  const hasNotes =
    (notes.lineComments && Object.keys(notes.lineComments).length > 0) ||
    (notes.blockComments && notes.blockComments.length > 0);

  if (!body) {
    return (
      <p className="py-3 text-sm text-[var(--text-muted)]">
        Текст песни пока не добавлен — откройте редактор студии.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        {songKey ? (
          <span>
            Тональность: <span className="font-mono font-semibold text-[var(--text)]">{songKey}</span>
          </span>
        ) : null}
        {tempo ? <span>BPM: {tempo}</span> : null}
        {timeSignature ? <span>Размер: {timeSignature}</span> : null}
        {hasNotes ? (
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
