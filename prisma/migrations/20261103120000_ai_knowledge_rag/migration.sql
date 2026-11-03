-- Local RAG knowledge base for the messenger AI assistant (requires pgvector).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  source_filename VARCHAR(500),
  mime_type VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error_text TEXT,
  source_text TEXT,
  char_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_documents_status
  ON ai_knowledge_documents (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_knowledge_chunks_doc_index_unique UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_document
  ON ai_knowledge_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_embedding_hnsw
  ON ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);
