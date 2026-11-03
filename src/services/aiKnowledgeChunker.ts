export const AI_KNOWLEDGE_CHUNK_TARGET = 1000;
export const AI_KNOWLEDGE_CHUNK_MAX = 1200;
export const AI_KNOWLEDGE_CHUNK_OVERLAP = 150;

export type KnowledgeChunkDraft = {
  index: number;
  content: string;
  tokenEstimate: number;
};

function estimateTokens(text: string): number {
  // Грубая оценка для RU/EN без токенизатора: ~3–4 символа на токен.
  return Math.max(1, Math.ceil(text.length / 3.5));
}

function normalizeSourceText(raw: string): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .split('\0')
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitParagraphs(text: string): string[] {
  const parts = text.split(/\n{2,}/);
  const out: string[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (p.length <= AI_KNOWLEDGE_CHUNK_MAX) {
      out.push(p);
      continue;
    }
    // Длинный абзац — режем по предложениям / жёстко по длине.
    const sentences = p.split(/(?<=[.!?…])\s+/);
    let buf = '';
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      if (!buf) {
        buf = s;
        continue;
      }
      if (`${buf} ${s}`.length <= AI_KNOWLEDGE_CHUNK_MAX) {
        buf = `${buf} ${s}`;
      } else {
        out.push(buf);
        buf = s;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

/**
 * Нарезка текста на чанки ~900–1200 символов с overlap.
 */
export function chunkKnowledgeText(raw: string): KnowledgeChunkDraft[] {
  const text = normalizeSourceText(raw);
  if (!text) return [];

  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = '';
  };

  for (const para of paragraphs) {
    if (!current) {
      current = para;
      continue;
    }
    const joined = `${current}\n\n${para}`;
    if (joined.length <= AI_KNOWLEDGE_CHUNK_TARGET || joined.length <= AI_KNOWLEDGE_CHUNK_MAX) {
      current = joined;
      continue;
    }
    flush();
    current = para;
  }
  flush();

  if (chunks.length <= 1 || AI_KNOWLEDGE_CHUNK_OVERLAP <= 0) {
    return chunks.map((content, index) => ({
      index,
      content,
      tokenEstimate: estimateTokens(content),
    }));
  }

  // Overlap: префикс следующего чанка из хвоста предыдущего.
  const withOverlap: string[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i += 1) {
    const prev = chunks[i - 1];
    const overlap = prev.slice(Math.max(0, prev.length - AI_KNOWLEDGE_CHUNK_OVERLAP)).trim();
    const next = chunks[i];
    withOverlap.push(overlap && !next.startsWith(overlap) ? `${overlap}\n\n${next}` : next);
  }

  return withOverlap.map((content, index) => ({
    index,
    content: content.trim(),
    tokenEstimate: estimateTokens(content),
  }));
}
