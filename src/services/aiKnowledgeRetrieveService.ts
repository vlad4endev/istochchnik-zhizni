import { query } from '../config/db';
import { embedQuery, embeddingToPgVectorLiteral } from '../ai/embeddingsClient';

export type RetrievedKnowledgeChunk = {
  chunkId: number;
  documentId: number;
  title: string;
  sourceFilename: string | null;
  content: string;
  distance: number;
};

export function formatKnowledgeContextBlock(chunks: RetrievedKnowledgeChunk[]): string {
  if (!chunks.length) {
    return (
      'База знаний: релевантных фрагментов не найдено. ' +
      'Если вопрос не про Писание и не про операционные данные церкви из других блоков — ' +
      'честно скажи, что в загруженной базе знаний нет ответа, и не выдумывай факты.'
    );
  }
  const body = chunks
    .map((c, i) => {
      const source = c.sourceFilename?.trim() || c.title;
      return (
        `### Фрагмент ${i + 1} (источник: «${c.title}»${source !== c.title ? `, файл: ${source}` : ''})\n` +
        c.content.trim()
      );
    })
    .join('\n\n');
  return (
    'База знаний (локальная RAG). Отвечай только по этим фрагментам. ' +
    'Не выдумывай цитаты, имена, даты и утверждения, которых здесь нет. ' +
    'В конце ответа укажи источник (название документа).\n\n' +
    body
  );
}

export async function retrieveKnowledgeChunks(
  question: string,
  options: { topK?: number; maxDistance?: number } = {},
): Promise<RetrievedKnowledgeChunk[]> {
  const q = String(question ?? '').trim();
  if (!q) return [];
  const topK = Math.min(12, Math.max(1, options.topK ?? 6));
  const maxDistance = typeof options.maxDistance === 'number' ? options.maxDistance : 0.55;

  let embedding: number[];
  try {
    embedding = await embedQuery(q);
  } catch (e) {
    console.warn('[ai-knowledge] embed query failed:', e instanceof Error ? e.message : e);
    return [];
  }

  const vectorLiteral = embeddingToPgVectorLiteral(embedding);
  try {
    const result = await query(
      `SELECT
         c.id::text AS chunk_id,
         c.document_id::text AS document_id,
         d.title,
         d.source_filename,
         c.content,
         (c.embedding <=> $1::vector) AS distance
       FROM ai_knowledge_chunks c
       INNER JOIN ai_knowledge_documents d ON d.id = c.document_id
       WHERE d.status = 'ready'
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral, topK],
    );

    return (result.rows as Array<{
      chunk_id: string;
      document_id: string;
      title: string;
      source_filename: string | null;
      content: string;
      distance: number;
    }>)
      .map((r) => ({
        chunkId: Number(r.chunk_id),
        documentId: Number(r.document_id),
        title: r.title,
        sourceFilename: r.source_filename,
        content: r.content,
        distance: Number(r.distance),
      }))
      .filter((r) => Number.isFinite(r.distance) && r.distance <= maxDistance && r.content.trim());
  } catch (e) {
    console.warn('[ai-knowledge] retrieve failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function countReadyKnowledgeDocuments(): Promise<number> {
  try {
    const result = await query(
      `SELECT COUNT(*)::text AS c FROM ai_knowledge_documents WHERE status = 'ready'`,
    );
    return Number((result.rows[0] as { c?: string } | undefined)?.c ?? 0) || 0;
  } catch {
    return 0;
  }
}
