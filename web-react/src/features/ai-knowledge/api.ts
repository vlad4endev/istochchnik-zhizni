import { apiClient } from '../../lib/apiClient';

/** Локальная RAG-база знаний (админ-модуль). */
export type AiKnowledgeDocStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface AiKnowledgeDocument {
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
}

export async function fetchAiKnowledgeDocuments(): Promise<{ documents: AiKnowledgeDocument[] }> {
  const { data } = await apiClient.get<{ documents: AiKnowledgeDocument[] }>('/api/settings/ai/knowledge');
  return data;
}

export async function uploadAiKnowledgeFile(
  file: File,
  title?: string,
): Promise<{ document: AiKnowledgeDocument }> {
  const form = new FormData();
  form.append('file', file);
  if (title?.trim()) form.append('title', title.trim());
  const { data } = await apiClient.post<{ document: AiKnowledgeDocument }>(
    '/api/settings/ai/knowledge',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function createAiKnowledgeText(body: {
  title: string;
  text: string;
}): Promise<{ document: AiKnowledgeDocument }> {
  const { data } = await apiClient.post<{ document: AiKnowledgeDocument }>(
    '/api/settings/ai/knowledge',
    body,
  );
  return data;
}

export async function deleteAiKnowledgeDocument(id: number): Promise<{ ok: boolean }> {
  const { data } = await apiClient.delete<{ ok: boolean }>(`/api/settings/ai/knowledge/${id}`);
  return data;
}

export async function reindexAiKnowledgeDocument(
  id: number,
): Promise<{ document: AiKnowledgeDocument | null }> {
  const { data } = await apiClient.post<{ document: AiKnowledgeDocument | null }>(
    `/api/settings/ai/knowledge/${id}/reindex`,
  );
  return data;
}
