import { createSongBlock, type SongBlock, type SongBlockType } from './songBlocks';

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
  key?: string | null;
  timeSignature?: string | null;
  bpm?: number | null;
  tempo?: string | null;
  sections: RecognizedSection[];
  generalNotes: string;
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
