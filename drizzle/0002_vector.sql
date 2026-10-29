-- Migration: 0002_vector.sql
-- Portable Memory v1 — Semantic vector embeddings

CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  ALTER TABLE memory_entries ADD COLUMN embedding vector(1536);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE memory_entries ADD COLUMN embedding_model TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS memory_entries_embedding_hnsw_idx
  ON memory_entries USING hnsw (embedding vector_cosine_ops);
