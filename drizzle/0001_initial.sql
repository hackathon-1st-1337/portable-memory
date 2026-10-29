-- Portable Memory v1 — initial schema
-- Migration: 0001_initial.sql
-- Applied via: pnpm run db:migrate (scripts/migrate.ts)
--
-- Extensions
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enum
DO $$ BEGIN
  CREATE TYPE visibility AS ENUM ('private', 'shared', 'public');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pods
CREATE TABLE IF NOT EXISTS pods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  description     TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  allow_embeddings BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pods_owner_slug_unique ON pods (owner_user_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS pods_owner_default_unique ON pods (owner_user_id)
  WHERE is_default AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pods_owner_active_idx ON pods (owner_user_id)
  WHERE deleted_at IS NULL;

-- namespaces
CREATE TABLE IF NOT EXISTS namespaces (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id               UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  parent_id            UUID REFERENCES namespaces(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  path                 LTREE NOT NULL,
  depth                SMALLINT NOT NULL CHECK (depth BETWEEN 1 AND 3),
  description          TEXT,
  default_visibility   TEXT NOT NULL DEFAULT 'shared',
  agents_can_create    BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS namespaces_path_gist_idx ON namespaces USING GIST (path);

-- Unique name per parent per pod (non-root namespaces)
CREATE UNIQUE INDEX IF NOT EXISTS namespaces_pod_parent_name_unique
  ON namespaces (pod_id, parent_id, name)
  WHERE parent_id IS NOT NULL;

-- Unique name per pod for root namespaces (parent_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS namespaces_pod_root_name_unique
  ON namespaces (pod_id, name)
  WHERE parent_id IS NULL;

-- agents (must come before memory_entries because of FK)
CREATE TABLE IF NOT EXISTS agents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id             UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  platform           TEXT NOT NULL,
  description        TEXT,
  created_via        TEXT NOT NULL DEFAULT 'dashboard',
  permissions        TEXT[] NOT NULL DEFAULT '{}',
  all_namespaces     BOOLEAN NOT NULL DEFAULT FALSE,
  status             TEXT NOT NULL DEFAULT 'active',
  expires_at         TIMESTAMPTZ,
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  last_seen_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pod_id, name)
);

-- memory_entries
CREATE TABLE IF NOT EXISTS memory_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id          UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  namespace_id    UUID NOT NULL REFERENCES namespaces(id),
  key             TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  value           JSONB NOT NULL,
  value_text      TEXT NOT NULL CHECK (octet_length(value_text) <= 4096),
  visibility      visibility NOT NULL DEFAULT 'shared',
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  version         INTEGER NOT NULL DEFAULT 1,
  created_by_user BOOLEAN NOT NULL,
  source_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  search_vector   TSVECTOR,
  last_read_at    TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_entries_ns_key_unique
  ON memory_entries (namespace_id, key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS memory_entries_search_vector_gin_idx
  ON memory_entries USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS memory_entries_value_text_trgm_idx
  ON memory_entries USING GIN (value_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS memory_entries_pod_pinned_idx
  ON memory_entries (pod_id, pinned)
  WHERE deleted_at IS NULL;

-- Trigger: keep search_vector up-to-date on insert/update
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', NEW.key), 'A') ||
    setweight(to_tsvector('english', LEFT(NEW.value_text, 1000)), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memory_entries_search_vector_trigger ON memory_entries;
CREATE TRIGGER memory_entries_search_vector_trigger
  BEFORE INSERT OR UPDATE OF key, value_text
  ON memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- memory_entry_versions
CREATE TABLE IF NOT EXISTS memory_entry_versions (
  entry_id          UUID NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  value             JSONB NOT NULL,
  value_text        TEXT NOT NULL,
  changed_by_user   BOOLEAN NOT NULL,
  source_agent_id   UUID,
  change            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, version)
);

-- agent_scopes
CREATE TABLE IF NOT EXISTS agent_scopes (
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  namespace_id  UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, namespace_id)
);

-- agent_tokens
CREATE TABLE IF NOT EXISTS agent_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash   BYTEA NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  label        TEXT,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit_events
CREATE TABLE IF NOT EXISTS audit_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pod_id          UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  actor_type      TEXT NOT NULL,
  agent_id        UUID,
  token_id        UUID,
  action          TEXT NOT NULL,
  namespace_id    UUID,
  namespace_path  TEXT,
  key             TEXT,
  outcome         TEXT NOT NULL,
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_pod_time_idx ON audit_events (pod_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_agent_time_idx ON audit_events (agent_id, created_at DESC);

-- rate_limit_windows
CREATE TABLE IF NOT EXISTS rate_limit_windows (
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER NOT NULL,
  PRIMARY KEY (agent_id, window_start)
);
