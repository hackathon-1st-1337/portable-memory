-- Migration: 0003_v2.sql
-- Portable Memory v2: Procedural Memory, Dreaming, Knowledge Graph, OAuth 2.1, and Storage

-- 1. Procedural Memory columns
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'fact';
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live';
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS procedure_when text;
ALTER TABLE namespaces ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS memory_entries_kind_idx ON memory_entries(pod_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS memory_entries_status_idx ON memory_entries(pod_id, status) WHERE deleted_at IS NULL;

-- 2. Dreaming (Background Consolidation)
CREATE TABLE IF NOT EXISTS dream_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL,
  stats jsonb
);
CREATE INDEX IF NOT EXISTS dream_runs_pod_idx ON dream_runs(pod_id, started_at DESC);

CREATE TABLE IF NOT EXISTS dream_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES dream_runs(id) ON DELETE CASCADE,
  pod_id uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  type text NOT NULL,
  entry_ids uuid[] NOT NULL,
  proposal jsonb NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS dream_suggestions_pod_status_idx ON dream_suggestions(pod_id, status);

-- 3. Knowledge Graph
CREATE TABLE IF NOT EXISTS kg_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_id, type, name)
);
CREATE INDEX IF NOT EXISTS kg_entities_pod_name_idx ON kg_entities(pod_id, name);

CREATE TABLE IF NOT EXISTS kg_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
  predicate text NOT NULL,
  object_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
  source_entry_id uuid NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
  confidence real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kg_relations_pod_subject_idx ON kg_relations(pod_id, subject_id);
CREATE INDEX IF NOT EXISTS kg_relations_pod_object_idx ON kg_relations(pod_id, object_id);
CREATE INDEX IF NOT EXISTS kg_relations_source_entry_idx ON kg_relations(source_entry_id);

CREATE TABLE IF NOT EXISTS kg_mentions (
  entity_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, entry_id)
);
CREATE INDEX IF NOT EXISTS kg_mentions_entry_idx ON kg_mentions(entry_id);

-- 4. OAuth 2.1
CREATE TABLE IF NOT EXISTS oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret_hash bytea,
  name text NOT NULL,
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code text PRIMARY KEY,
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  pod_id uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Object Storage Ingestion Metadata
CREATE TABLE IF NOT EXISTS s3_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  s3_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  source_entry_id uuid REFERENCES memory_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS s3_objects_pod_idx ON s3_objects(pod_id, created_at DESC);
