import { buildSectionMarker, parseSectionTitle } from './sectionMarkers';

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

function splitByDoubleNewlines(text: string): string[] {
  const chunks = text
    .split(/\n{2,}/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return chunks;
}

function blocksFromParagraphsWhenNoHeaders(rawText: string): string {
  const paras = splitByDoubleNewlines(rawText);
  if (paras.length === 0) return rawText.trimEnd();
  if (paras.length === 1) return `${buildSectionMarker('Куплет 1')}\n${paras[0]!.trimEnd()}\n`;

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

  let verseCounter = 0;
  const outLines: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const para = paras[i] ?? '';
    if (best && norms[i] === best.norm) {
      outLines.push(buildSectionMarker('Припев'));
      outLines.push(para.trimEnd());
      outLines.push('');
      continue;
    }
    verseCounter += 1;
    outLines.push(buildSectionMarker(`Куплет ${verseCounter}`));
    outLines.push(para.trimEnd());
    outLines.push('');
  }

  return outLines.join('\n').trimEnd() + '\n';
}

/**
 * Умный импорт в ChordPro с секциями `{sec:...}`.
 *
 * Важно: этот серверный вариант не пытается “починить” аккорды или преобразовать
 * “аккорды над текстом” в inline-формат — он делает именно структурирование по секциям.
 */
export function smartImportTextToChordPro(raw: string): string {
  const normalized = (typeof raw === 'string' ? raw : '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (!normalized.trim()) return '';

  const lines = normalized.split('\n');
  const out: string[] = [];
  let sawAnyHeader = false;

  let curTitle: string | null = null;
  let curLines: string[] = [];

  const flush = () => {
    const body = curLines.join('\n').trimEnd();
    if (!curTitle && !body.trim()) {
      curLines = [];
      return;
    }
    if (curTitle) out.push(buildSectionMarker(curTitle));
    if (body.trim()) out.push(body);
    out.push('');
    curTitle = null;
    curLines = [];
  };

  for (const line of lines) {
    const title = parseSectionTitle(unwrapHeadingDecorations(line));
    if (title !== null) {
      sawAnyHeader = true;
      flush();
      curTitle = title;
      continue;
    }
    curLines.push(line);
  }
  flush();

  if (!sawAnyHeader) {
    return blocksFromParagraphsWhenNoHeaders(normalized);
  }

  return out.join('\n').trimEnd() + '\n';
}

