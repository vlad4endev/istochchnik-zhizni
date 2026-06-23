import { blocksToChordPro, createSongBlock, type SongBlock, type SongBlockType } from './songBlocks';

export type RecognizedSectionType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'section';

export type RecognizedSection = {
  type: RecognizedSectionType;
  label: string;
  bars?: number | null;
  chords: string[];
  lyricHint?: string | null;
};

export type RecognizedSong = {
  title?: string | null;
  composer?: string | null;
  arranger?: string | null;
  key?: string | null;
  timeSignature?: string | null;
  bpm?: number | null;
  tempo?: string | null;
  sections: RecognizedSection[];
  generalNotes: string;
  abcNotation?: string | null;
  sourceImageUrl?: string | null;
};

const SECTION_TYPE_MAP: Record<RecognizedSectionType, SongBlockType> = {
  intro: 'intro',
  verse: 'verse',
  chorus: 'chorus',
  bridge: 'bridge',
  outro: 'outro',
  section: 'verse',
};

function chordToken(ch: string): string {
  const t = ch.trim();
  if (!t) return '';
  if (t.startsWith('[') && t.endsWith(']')) return t;
  return `[${t}]`;
}

export function recognizedSectionsToBlocks(sections: RecognizedSection[]): SongBlock[] {
  if (!sections.length) return [];
  return sections
    .map((section) => {
      const type = SECTION_TYPE_MAP[section.type] ?? 'verse';
      const lines: string[] = [];
      if (section.chords.length > 0) {
        lines.push(section.chords.map(chordToken).join(' '));
      }
      if (section.lyricHint?.trim()) {
        lines.push(section.lyricHint.trim());
      }
      const content = lines.join('\n');
      if (!content.trim()) return null;
      return createSongBlock(type, content, section.label?.trim() || undefined);
    })
    .filter((b): b is SongBlock => b !== null);
}

export function buildRecognitionNotes(data: RecognizedSong, existing = ''): string {
  const parts: string[] = [];
  if (existing.trim()) parts.push(existing.trim());
  if (data.composer?.trim()) parts.push(`Автор: ${data.composer.trim()}`);
  if (data.tempo?.trim() && !data.bpm) parts.push(`Темп: ${data.tempo.trim()}`);
  if (data.generalNotes?.trim()) parts.push(data.generalNotes.trim());
  const structure = data.sections
    .map((s) => {
      const bits = [s.label];
      if (s.bars) bits.push(`${s.bars}т.`);
      if (s.chords.length) bits.push(s.chords.join(', '));
      return bits.join(' — ');
    })
    .filter(Boolean)
    .join(' | ');
  if (structure) parts.push(`Структура: ${structure}`);
  return parts.filter(Boolean).join('\n').trim();
}

export type SheetVersionMeta = {
  bpm?: number | null;
  timeSignature?: string | null;
  composer?: string | null;
  arranger?: string | null;
  title?: string | null;
  generalNotes?: string | null;
  abcNotation?: string | null;
  sourceImageUrl?: string | null;
};

export function buildSheetMetaFromRecognition(data: RecognizedSong): SheetVersionMeta {
  const notes = buildRecognitionNotes(data);
  return {
    bpm: data.bpm ?? null,
    timeSignature: data.timeSignature ?? null,
    composer: data.composer ?? null,
    arranger: data.arranger ?? null,
    title: data.title ?? null,
    generalNotes: notes || data.generalNotes || null,
    abcNotation: data.abcNotation ?? null,
    sourceImageUrl: data.sourceImageUrl ?? null,
  };
}

export function recognizedSongToSheetChordPro(data: RecognizedSong): string {
  const sectionBlocks = recognizedSectionsToBlocks(data.sections);
  if (sectionBlocks.length > 0) {
    return blocksToChordPro(sectionBlocks);
  }
  const notes = buildRecognitionNotes(data);
  return notes ? `{sec:Партитура}\n${notes}` : '';
}
