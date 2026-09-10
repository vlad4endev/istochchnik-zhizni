import type { StudioSheetMeta } from '../api/studio';

/** Types + converters for AI sheet recognition (aligned with web studio). */

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

const SECTION_LABEL: Record<RecognizedSectionType, string> = {
  intro: 'Intro',
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
  outro: 'Outro',
  section: 'Section',
};

function chordToken(ch: string): string {
  const t = ch.trim();
  if (!t) return '';
  if (t.startsWith('[') && t.endsWith(']')) return t;
  return `[${t}]`;
}

export function buildRecognitionNotes(data: RecognizedSong, existing = ''): string {
  const parts: string[] = [];
  if (existing.trim()) parts.push(existing.trim());
  if (data.composer?.trim()) parts.push(`Автор: ${data.composer.trim()}`);
  if (data.tempo?.trim() && !data.bpm) parts.push(`Темп: ${data.tempo.trim()}`);
  if (data.generalNotes?.trim()) parts.push(data.generalNotes.trim());
  const structure = (data.sections ?? [])
    .map((s) => {
      const bits = [s.label];
      if (s.bars) bits.push(`${s.bars}т.`);
      if (s.chords?.length) bits.push(s.chords.join(', '));
      return bits.join(' — ');
    })
    .filter(Boolean)
    .join(' | ');
  if (structure) parts.push(`Структура: ${structure}`);
  return parts.filter(Boolean).join('\n').trim();
}

export function buildSheetMetaFromRecognition(data: RecognizedSong): StudioSheetMeta {
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
  const sections = data.sections ?? [];
  if (sections.length === 0) {
    const notes = buildRecognitionNotes(data);
    return notes ? `{sec:Партитура}\n${notes}` : '';
  }

  const chunks: string[] = [];
  for (const section of sections) {
    const label =
      section.label?.trim() || SECTION_LABEL[section.type] || SECTION_LABEL.section;
    const lines: string[] = [];
    if (section.chords?.length) {
      lines.push(section.chords.map(chordToken).join(' '));
    }
    if (section.lyricHint?.trim()) {
      lines.push(section.lyricHint.trim());
    }
    if (!lines.length) continue;
    chunks.push(`{sec:${label}}\n${lines.join('\n')}`);
  }

  if (chunks.length === 0) {
    const notes = buildRecognitionNotes(data);
    return notes ? `{sec:Партитура}\n${notes}` : '';
  }
  return chunks.join('\n\n');
}
