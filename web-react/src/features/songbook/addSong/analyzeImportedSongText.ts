import { isChordToken, normalizeChordSymbolForCatalog } from './chordProConversion';

const SECTION_KEYWORDS_RE =
  /\b(intro|verse|chorus|bridge|outro|solo|pre-chorus|prechorus|куплет|припев|бридж|аутро|интро|проигрыш|предприпев)\b/i;
const CHORD_LIKE_RE = /^[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?$/i;
const HASH_BLOCK_RE = /^\s*#\s*(.+?)\s*$/;

export type ImportedTextAnalysis = {
  chordCount: number;
  sectionCount: number;
  sectionTitles: string[];
  uncertainChords: string[];
};

function tokenize(line: string): string[] {
  return line
    .replace(/\|/g, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function analyzeImportedSongText(raw: string): ImportedTextAnalysis {
  const text = typeof raw === 'string' ? raw : '';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections = new Set<string>();
  const uncertain = new Set<string>();
  let chordCount = 0;

  for (const line of lines) {
    const hash = line.match(HASH_BLOCK_RE);
    if (hash?.[1]) {
      const title = hash[1].trim();
      if (title) sections.add(title);
    } else if (SECTION_KEYWORDS_RE.test(line)) {
      const clean = line.trim().replace(/[:\-–—]+$/g, '');
      if (clean.length > 0 && clean.length <= 60) sections.add(clean);
    }

    const tokens = tokenize(line);
    if (tokens.length === 0) continue;

    const normalizedChordTokens = tokens
      .map((t) => normalizeChordSymbolForCatalog(t))
      .filter((v): v is string => v != null);

    if (normalizedChordTokens.length > 0) {
      chordCount += normalizedChordTokens.length;
    }

    const chordRatio = normalizedChordTokens.length / tokens.length;
    if (chordRatio < 0.5) continue;

    for (const token of tokens) {
      if (isChordToken(token)) continue;
      if (CHORD_LIKE_RE.test(token)) uncertain.add(token);
    }
  }

  return {
    chordCount,
    sectionCount: sections.size,
    sectionTitles: Array.from(sections).slice(0, 8),
    uncertainChords: Array.from(uncertain).slice(0, 12),
  };
}
