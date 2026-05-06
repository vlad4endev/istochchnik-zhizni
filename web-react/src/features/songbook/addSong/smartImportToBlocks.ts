import { parseSectionTitle } from '../utils/sectionMarkers';
import {
  blocksToChordPro,
  createSongBlock,
  splitPasteByDoubleNewlines,
  type SongBlock,
  type SongBlockType,
} from '../studio/songBlocks';
import { convertToChordPro } from './chordProConversion';

function isRomanOrNumberToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return false;
  if (/^\d{1,3}$/.test(t)) return true;
  return /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/.test(t);
}

function toCanonicalHint(baseRu: string, ordinal: number | null): string {
  if (!ordinal) return baseRu;
  return `${baseRu} ${ordinal}`;
}

function detectTypeAndHint(
  rawTitle: string,
  state: { verseCounter: number },
): { type: SongBlockType; sectionHint?: string } {
  const title = rawTitle.trim().replace(/\s+/g, ' ');
  const lower = title.toLowerCase();

  // Verse numbering: "Куплет", "Verse", "Verse 2", "Куплет II"
  if (/(^|\b)(куплет|verse)(\b|$)/i.test(title)) {
    const tokens = title.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1] ?? '';
    const hasOrdinal = isRomanOrNumberToken(last);
    if (hasOrdinal) {
      const n = /^\d+$/.test(last) ? Number(last) : null;
      if (typeof n === 'number' && Number.isFinite(n)) {
        state.verseCounter = Math.max(state.verseCounter, n);
      } else {
        state.verseCounter += 1;
      }
      return { type: 'verse', sectionHint: title };
    }
    state.verseCounter += 1;
    return { type: 'verse', sectionHint: toCanonicalHint('Куплет', state.verseCounter) };
  }

  if (/(^|\b)(предприпев|pre-chorus|prechorus)(\b|$)/i.test(lower)) {
    return { type: 'prechorus', sectionHint: /предприпев/i.test(title) ? title : 'Предприпев' };
  }

  if (/(^|\b)(припев|chorus)(\b|$)/i.test(lower)) {
    return { type: 'chorus', sectionHint: /припев/i.test(title) ? title : 'Припев' };
  }

  if (/(^|\b)(бридж|bridge|мост)(\b|$)/i.test(lower)) {
    return { type: 'bridge', sectionHint: /bridge/i.test(title) ? 'Бридж' : title };
  }

  if (/(^|\b)(соло|solo)(\b|$)/i.test(lower)) {
    return { type: 'solo', sectionHint: /соло/i.test(title) ? title : 'Соло' };
  }

  if (/(^|\b)(аутро|outro|финал)(\b|$)/i.test(lower)) {
    return { type: 'outro', sectionHint: /аутро/i.test(title) ? title : 'Аутро' };
  }

  if (/(^|\b)(интро|intro|вступлен|проигрыш|инструментал)(\b|$)/i.test(lower)) {
    return { type: 'intro', sectionHint: /intro/i.test(title) ? 'Вступление' : title };
  }

  // Unknown: keep as a "named verse" to preserve user intent.
  return { type: 'verse', sectionHint: title || undefined };
}

function stripLeadingEmptyLines(lines: string[]): string[] {
  let i = 0;
  while (i < lines.length && !lines[i]?.trim()) i += 1;
  return lines.slice(i);
}

function stripTrailingEmptyLines(lines: string[]): string[] {
  let j = lines.length - 1;
  while (j >= 0 && !lines[j]?.trim()) j -= 1;
  return lines.slice(0, j + 1);
}

function unwrapHeadingDecorations(line: string): string {
  const t = line.trim();
  if (!t) return t;
  // "— Припев —", "--- Chorus ---", "== Куплет 1 =="
  const m = t.match(/^(?:[-—–=*_]{1,})\s*(.+?)\s*(?:[-—–=*_]{1,})$/u);
  return m?.[1]?.trim() ?? t;
}

function normalizeForRepeatDetection(paragraph: string): string {
  return paragraph
    .replace(/\[[^\]]+\]/g, ' ') // remove chordpro chords
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function paragraphHasEnoughLyrics(paragraph: string): boolean {
  const t = paragraph.replace(/\[[^\]]+\]/g, '');
  const letters = (t.match(/[\p{L}]/gu) ?? []).length;
  return letters >= 20;
}

function blocksFromParagraphsWhenNoHeaders(rawText: string): SongBlock[] {
  const paras = splitPasteByDoubleNewlines(rawText);
  if (paras.length === 0) return [createSongBlock('verse', '')];
  if (paras.length === 1) return [createSongBlock('verse', convertToChordPro(paras[0]!.trimEnd()), 'Куплет 1')];

  const normToCount = new Map<string, number>();
  const normToFirstIndex = new Map<string, number>();
  const norms = paras.map((p, i) => {
    const n = normalizeForRepeatDetection(p);
    if (n) {
      normToCount.set(n, (normToCount.get(n) ?? 0) + 1);
      if (!normToFirstIndex.has(n)) normToFirstIndex.set(n, i);
    }
    return n;
  });

  let best: { norm: string; count: number; firstIndex: number } | null = null;
  for (const [norm, count] of normToCount.entries()) {
    if (count < 2) continue;
    const firstIndex = normToFirstIndex.get(norm) ?? 0;
    const para = paras[firstIndex] ?? '';
    if (!paragraphHasEnoughLyrics(para)) continue;
    if (!best || count > best.count || (count === best.count && firstIndex < best.firstIndex)) {
      best = { norm, count, firstIndex };
    }
  }

  const blocks: SongBlock[] = [];
  let verseCounter = 0;

  for (let i = 0; i < paras.length; i++) {
    const para = paras[i] ?? '';
    const chordPro = convertToChordPro(para.trimEnd());
    if (best && norms[i] === best.norm) {
      blocks.push(createSongBlock('chorus', chordPro, 'Припев'));
      continue;
    }
    verseCounter += 1;
    blocks.push(createSongBlock('verse', chordPro, `Куплет ${verseCounter}`));
  }

  return blocks.length ? blocks : [createSongBlock('verse', convertToChordPro(rawText.trimEnd()))];
}

/**
 * Умный импорт: разбивает плоский текст на блоки песни, используя заголовки секций
 * (Куплет/Припев/Бридж/Интро/Аутро/Предприпев/Соло), а затем конвертирует аккорды в ChordPro.
 */
export function smartImportTextToBlocks(raw: string): SongBlock[] {
  const normalized = (typeof raw === 'string' ? raw : '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (!normalized.trim()) return [createSongBlock('verse', '')];

  const lines = normalized.split('\n');
  const blocks: SongBlock[] = [];
  const state = { verseCounter: 0 };
  let sawAnyHeader = false;

  let cur: { type: SongBlockType; sectionHint?: string; lines: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const bodyLines = stripTrailingEmptyLines(stripLeadingEmptyLines(cur.lines));
    const body = bodyLines.join('\n').trimEnd();
    blocks.push(
      createSongBlock(
        cur.type,
        body ? convertToChordPro(body) : '',
        cur.sectionHint,
      ),
    );
    cur = null;
  };

  for (const line of lines) {
    const title = parseSectionTitle(unwrapHeadingDecorations(line));
    if (title !== null) {
      sawAnyHeader = true;
      flush();
      const meta = detectTypeAndHint(title, state);
      cur = { type: meta.type, sectionHint: meta.sectionHint, lines: [] };
      continue;
    }
    if (!cur) cur = { type: 'verse', lines: [] };
    cur.lines.push(line);
  }
  flush();

  // Без явных заголовков секций попробуем угадать структуру по повторяющимся абзацам.
  if (!sawAnyHeader) {
    return blocksFromParagraphsWhenNoHeaders(normalized);
  }

  if (blocks.length === 0) return [createSongBlock('verse', convertToChordPro(normalized.trimEnd()))];

  return blocks;
}

export function smartImportTextToChordPro(raw: string): string {
  return blocksToChordPro(smartImportTextToBlocks(raw));
}

