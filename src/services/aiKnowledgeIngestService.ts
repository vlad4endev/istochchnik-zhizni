import { pool, query } from '../config/db';
import { AiAgentError } from '../ai/llmClient';
import { embedTexts, embeddingToPgVectorLiteral } from '../ai/embeddingsClient';
import { extractDocumentPlainText } from '../utils/assistantDocumentText';
import { chunkKnowledgeText } from './aiKnowledgeChunker';

export type AiKnowledgeDocStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type AiKnowledgeDocumentRow = {
  id: number;
  title: string;
  source_filename: string | null;
  mime_type: string | null;
  status: AiKnowledgeDocStatus;
  error_text: string | null;
  char_count: number;
  chunk_count: number;
  uploaded_by: number | null;
  created_at: string;
  updated_at: string;
};

const EMBED_BATCH = 16;

function mapDoc(row: Record<string, unknown>): AiKnowledgeDocumentRow {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    source_filename: row.source_filename == null ? null : String(row.source_filename),
    mime_type: row.mime_type == null ? null : String(row.mime_type),
    status: String(row.status ?? 'pending') as AiKnowledgeDocStatus,
    error_text: row.error_text == null ? null : String(row.error_text),
    char_count: Number(row.char_count ?? 0) || 0,
    chunk_count: Number(row.chunk_count ?? 0) || 0,
    uploaded_by: row.uploaded_by == null ? null : Number(row.uploaded_by),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function listKnowledgeDocuments(): Promise<AiKnowledgeDocumentRow[]> {
  const result = await query(
    `SELECT id, title, source_filename, mime_type, status, error_text,
            char_count, chunk_count, uploaded_by, created_at, updated_at
     FROM ai_knowledge_documents
     ORDER BY updated_at DESC, id DESC
     LIMIT 500`,
  );
  return (result.rows as Record<string, unknown>[]).map(mapDoc);
}

export async function getKnowledgeDocument(id: number): Promise<AiKnowledgeDocumentRow | null> {
  const result = await query(
    `SELECT id, title, source_filename, mime_type, status, error_text,
            char_count, chunk_count, uploaded_by, created_at, updated_at
     FROM ai_knowledge_documents WHERE id = $1`,
    [id],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapDoc(row) : null;
}

async function setDocStatus(
  id: number,
  status: AiKnowledgeDocStatus,
  extra: {
    error_text?: string | null;
    clearError?: boolean;
    char_count?: number;
    chunk_count?: number;
    source_text?: string | null;
  } = {},
): Promise<void> {
  await query(
    `UPDATE ai_knowledge_documents SET
       status = $2,
       error_text = CASE
         WHEN $7::boolean THEN $3
         WHEN $3::text IS NOT NULL THEN $3
         ELSE error_text
       END,
       char_count = COALESCE($4, char_count),
       chunk_count = COALESCE($5, chunk_count),
       source_text = COALESCE($6, source_text),
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      status,
      extra.error_text ?? null,
      extra.char_count ?? null,
      extra.chunk_count ?? null,
      extra.source_text ?? null,
      Boolean(extra.clearError || extra.error_text === null),
    ],
  );
}

async function deleteChunks(documentId: number): Promise<void> {
  await query(`DELETE FROM ai_knowledge_chunks WHERE document_id = $1`, [documentId]);
}

async function indexPlainText(documentId: number, title: string, text: string): Promise<void> {
  const chunks = chunkKnowledgeText(text);
  if (!chunks.length) {
    throw new AiAgentError('После разбора не осталось текста для индексации', 'ai_bad_response');
  }

  await deleteChunks(documentId);

  for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) {
    const batch = chunks.slice(offset, offset + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((c) => c.content));
    if (!pool) throw new Error('Database pool is not initialized');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < batch.length; i += 1) {
        const chunk = batch[i];
        const emb = vectors[i];
        await client.query(
          `INSERT INTO ai_knowledge_chunks
             (document_id, chunk_index, content, token_estimate, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)
           ON CONFLICT (document_id, chunk_index) DO UPDATE SET
             content = EXCLUDED.content,
             token_estimate = EXCLUDED.token_estimate,
             embedding = EXCLUDED.embedding,
             metadata = EXCLUDED.metadata`,
          [
            documentId,
            chunk.index,
            chunk.content,
            chunk.tokenEstimate,
            embeddingToPgVectorLiteral(emb),
            JSON.stringify({ title, chunk_index: chunk.index }),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  await setDocStatus(documentId, 'ready', {
    clearError: true,
    error_text: null,
    char_count: text.length,
    chunk_count: chunks.length,
    source_text: text,
  });
}

export async function processKnowledgeDocument(documentId: number): Promise<void> {
  const result = await query(
    `SELECT id::text, title, source_text, status FROM ai_knowledge_documents WHERE id = $1`,
    [documentId],
  );
  const row = result.rows[0] as
    | { id: string; title: string; source_text: string | null; status: string }
    | undefined;
  if (!row) return;

  await setDocStatus(documentId, 'processing', { clearError: true, error_text: null });
  try {
    const text = String(row.source_text ?? '').trim();
    if (!text) {
      throw new AiAgentError('У документа нет текста для индексации', 'ai_bad_response');
    }
    await indexPlainText(documentId, row.title, text);
  } catch (e) {
    const message =
      e instanceof AiAgentError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Не удалось проиндексировать документ';
    console.error('[ai-knowledge] process failed', documentId, message);
    await setDocStatus(documentId, 'failed', { error_text: message, chunk_count: 0 });
  }
}

function scheduleProcess(documentId: number): void {
  setImmediate(() => {
    void processKnowledgeDocument(documentId);
  });
}

export async function createKnowledgeDocumentFromText(input: {
  title: string;
  text: string;
  uploadedBy?: number | null;
  sourceFilename?: string | null;
  mimeType?: string | null;
}): Promise<AiKnowledgeDocumentRow> {
  const title = String(input.title ?? '').trim() || 'Без названия';
  const text = String(input.text ?? '').trim();
  if (!text) {
    throw new AiAgentError('Пустой текст — нечего индексировать', 'ai_bad_response');
  }

  const result = await query(
    `INSERT INTO ai_knowledge_documents
       (title, source_filename, mime_type, status, source_text, char_count, uploaded_by)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6)
     RETURNING id, title, source_filename, mime_type, status, error_text,
               char_count, chunk_count, uploaded_by, created_at, updated_at`,
    [
      title.slice(0, 500),
      input.sourceFilename?.trim()?.slice(0, 500) || null,
      input.mimeType?.trim()?.slice(0, 255) || 'text/plain',
      text,
      text.length,
      input.uploadedBy ?? null,
    ],
  );
  const doc = mapDoc(result.rows[0] as Record<string, unknown>);
  scheduleProcess(doc.id);
  return doc;
}

export async function createKnowledgeDocumentFromFile(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
  title?: string | null;
  uploadedBy?: number | null;
}): Promise<AiKnowledgeDocumentRow> {
  const fileName = String(input.fileName ?? '').trim() || 'document';
  const extracted = await extractDocumentPlainText({
    buffer: input.buffer,
    fileName,
    mimeType: input.mimeType,
  });
  if (!extracted.text.trim()) {
    throw new AiAgentError(
      extracted.warning || 'Не удалось извлечь текст из файла',
      'ai_bad_response',
    );
  }
  const title =
    String(input.title ?? '').trim() ||
    fileName.replace(/\.[^.]+$/, '').trim() ||
    fileName;
  return createKnowledgeDocumentFromText({
    title,
    text: extracted.text,
    uploadedBy: input.uploadedBy,
    sourceFilename: fileName,
    mimeType: input.mimeType ?? null,
  });
}

export async function deleteKnowledgeDocument(id: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM ai_knowledge_documents WHERE id = $1 RETURNING id::text`,
    [id],
  );
  return result.rows.length > 0;
}

export async function reindexKnowledgeDocument(id: number): Promise<AiKnowledgeDocumentRow | null> {
  const existing = await getKnowledgeDocument(id);
  if (!existing) return null;
  scheduleProcess(id);
  return getKnowledgeDocument(id);
}
