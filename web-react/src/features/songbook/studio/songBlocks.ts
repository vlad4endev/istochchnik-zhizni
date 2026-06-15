export type SongBlockType = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'solo' | 'outro';

export type SongBlock = {
  id: string;
  type: SongBlockType;
  /** Тело блока без строки-заголовка секции */
  content: string;
  /**
   * Если задано, при сохранении используется `{sec:…}` (куплет с номером и т.д.),
   * иначе — `{section:Verse}` и т.п.
   */
  sectionHint?: string;
};

const HEADER_LINE_RE = /^\{(?:section|sec):\s*([^}]+?)\s*\}\s*$/i;
const HASH_HEADER_RE = /^\s*#\s*(.+?)\s*$/;

function newBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `b_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createSongBlock(
  type: SongBlockType,
  content = '',
  sectionHint?: string,
  id?: string,
): SongBlock {
  return {
    id: id ?? newBlockId(),
    type,
    content,
    ...(sectionHint ? { sectionHint } : {}),
  };
}

function typeToSectionDirective(type: SongBlockType): string {
  const map: Record<SongBlockType, string> = {
    intro: 'Intro',
    verse: 'Verse',
    prechorus: 'Pre-Chorus',
    chorus: 'Chorus',
    bridge: 'Bridge',
    solo: 'Solo',
    outro: 'Outro',
  };
  return `{section: ${map[type]}}`;
}

/** Заголовок одного блока в ChordPro-файле */
export function blockToChordProHeader(block: SongBlock): string {
  if (block.sectionHint?.trim()) {
    return `{sec:${block.sectionHint.trim()}}`;
  }
  return typeToSectionDirective(block.type);
}

/** Склеить блоки в один ChordPro-текст для API / песенника */
export function blocksToChordPro(blocks: SongBlock[]): string {
  const parts = blocks.map((b) => {
    const head = blockToChordProHeader(b);
    const body = typeof b.content === 'string' ? b.content.replace(/\s+$/u, '') : '';
    return body.length > 0 ? `${head}\n${body}` : `${head}\n`;
  });
  return parts.join('\n\n');
}

function labelToBlockMeta(label: string): { type: SongBlockType; sectionHint?: string } {
  const raw = label.trim();
  if (!raw) return { type: 'verse' };
  const lower = raw.toLowerCase();

  if (/припев/i.test(raw) || lower === 'chorus') {
    return /припев/i.test(raw) ? { type: 'chorus', sectionHint: raw } : { type: 'chorus' };
  }
  if (/предприпев/i.test(raw) || lower === 'pre-chorus' || lower === 'prechorus') {
    return /предприпев/i.test(raw) ? { type: 'prechorus', sectionHint: raw } : { type: 'prechorus' };
  }
  if (/^verse$|куплет/i.test(lower)) {
    return lower === 'verse' ? { type: 'verse' } : { type: 'verse', sectionHint: raw };
  }
  if (/^bridge$|бридж|мост/i.test(lower)) {
    return lower === 'bridge' ? { type: 'bridge' } : { type: 'bridge', sectionHint: raw };
  }
  if (/^solo$|соло/i.test(lower)) {
    return lower === 'solo' ? { type: 'solo' } : { type: 'solo', sectionHint: raw };
  }
  if (/^outro$|аутро|финал/i.test(lower)) {
    return lower === 'outro' ? { type: 'outro' } : { type: 'outro', sectionHint: raw };
  }
  if (/^intro$|интро|вступлен|проигрыш|инструментал/i.test(lower)) {
    return lower === 'intro' ? { type: 'intro' } : { type: 'intro', sectionHint: raw };
  }

  return { type: 'verse', sectionHint: raw };
}

function parseHeaderLine(line: string): { type: SongBlockType; sectionHint?: string } | null {
  const hash = line.trim().match(HASH_HEADER_RE);
  if (hash?.[1]) return labelToBlockMeta(hash[1]);

  const m = line.trim().match(HEADER_LINE_RE);
  if (!m) return null;
  const inner = (m[1] ?? '').trim();
  if (!inner) return { type: 'verse' };

  const lower = inner.toLowerCase();
  if (lower === 'chorus') return { type: 'chorus' };
  if (lower === 'verse') return { type: 'verse' };
  if (lower === 'pre-chorus' || lower === 'prechorus') return { type: 'prechorus' };
  if (lower === 'bridge') return { type: 'bridge' };
  if (lower === 'intro') return { type: 'intro' };
  if (lower === 'solo') return { type: 'solo' };
  if (lower === 'outro') return { type: 'outro' };

  return labelToBlockMeta(inner);
}

type Building = { type: SongBlockType; sectionHint?: string; lines: string[] };

/**
 * Разобрать сохранённый ChordPro на блоки (поддержка `{section:…}` и `{sec:…}`).
 */
export function chordProToBlocks(text: string): SongBlock[] {
  const raw = (typeof text === 'string' ? text : '').replace(/\r\n/g, '\n');
  if (!raw.trim()) return [createSongBlock('verse', '')];

  const lines = raw.split('\n');
  const blocks: SongBlock[] = [];
  let cur: Building | null = null;

  const flush = () => {
    if (!cur) return;
    const content = cur.lines.join('\n').replace(/\n+$/u, '');
    blocks.push(createSongBlock(cur.type, content, cur.sectionHint));
    cur = null;
  };

  for (const line of lines) {
    const header = parseHeaderLine(line);
    if (header) {
      flush();
      cur = { type: header.type, sectionHint: header.sectionHint, lines: [] };
      continue;
    }
    if (!cur) cur = { type: 'verse', lines: [] };
    cur.lines.push(line);
  }
  flush();

  if (blocks.length > 0) return blocks;

  return [createSongBlock('verse', raw.trimEnd())];
}

/** Пресеты панели «Блок песни» → тип и подпись для `{sec:…}` */
export function studioPresetToBlockMeta(
  label: string,
): { type: SongBlockType; sectionHint?: string } {
  const t = label.trim();
  switch (t) {
    case 'Интро':
    case 'Вступление':
    case 'Проигрыш':
    case 'Инструментал':
    case 'Финал':
      return { type: 'intro', sectionHint: t };
    case 'Куплет 1':
    case 'Куплет 2':
    case 'Куплет 3':
    case 'Куплет':
      return { type: 'verse', sectionHint: t };
    case 'Припев':
      return { type: 'chorus', sectionHint: t };
    case 'Предприпев':
      return { type: 'prechorus', sectionHint: t };
    case 'Мост':
    case 'Бридж':
      return { type: 'bridge', sectionHint: t };
    case 'Соло':
      return { type: 'solo', sectionHint: t };
    case 'Аутро':
      return { type: 'outro', sectionHint: t };
    default:
      return { type: 'verse', sectionHint: t };
  }
}

/**
 * Разбить вставленный текст по двойным переносам строк (пустые строки между абзацами).
 */
export function splitPasteByDoubleNewlines(text: string): string[] {
  const t = typeof text === 'string' ? text : '';
  return t
    .split(/\n(?:[ \t]*\n)+/)
    .map((p) => p.replace(/^\s+|\s+$/gu, ''))
    .filter((p) => p.length > 0);
}

/** Dev-only: логирует расхождение ChordPro ↔ блоки (потеря данных при roundtrip). */
export function assertRoundtrip(content: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  const blocks = chordProToBlocks(content);
  const rebuilt = blocksToChordPro(blocks);
  if (content.trim() !== rebuilt.trim()) {
    console.error('ROUNDTRIP FAIL:', { original: content, rebuilt });
  }
}
