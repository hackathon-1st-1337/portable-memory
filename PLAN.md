# Portable Memory — v1 / v2 Plan (with database schema)

## Context

Portable Memory gives each user one or more memory pods (e.g. "Personal", "Work") that any AI agent (Claude, ChatGPT, custom bots) can plug into, with the user controlling exactly what each agent sees. Human authentication is done: Neon Managed Auth, `/dashboard`, `/account`, verified end-to-end. Nothing of the memory product exists yet: no schema, no agent identity, no API, no MCP.

This plan defines the data model and the build order. **v1** delivers the core loop: user curates memory in folders, connects agents with scoped tokens, and agents read and write over REST/MCP with full audit. **v2** adds procedural memory, "dreaming" (background consolidation) and a knowledge graph, plus OAuth for MCP.

**Decisions locked with the user:** many pods per user (each pod is a fully isolated memory) · keyword search first, embeddings as the last v1 milestone · MCP with bearer tokens in v1, OAuth in v2 · procedural memory, dreaming and the knowledge graph in v2.

**Verified facts this plan depends on:**
- Neon supports `ltree`, `vector` (pgvector 0.8), `pg_trgm`, `pgcrypto`, `pg_cron`. Apache AGE is **not** available, so the graph uses plain tables.
- Direct Postgres on port 5432 timed out from this machine (psql hung). Use the Neon serverless driver (HTTPS/WebSocket on 443) for the app, and confirm drizzle-kit connectivity in M0.
- Latest packages on npm as of 2026-10-25: drizzle-orm 0.45.4, drizzle-kit 0.31.11, @neondatabase/serverless 1.2.0, @modelcontextprotocol/sdk 1.32.2, mcp-handler 2.3.0, zod 4.6.7. Per AGENTS.md, read the docs or use `find-skills` before using each; don't rely on older API knowledge.

---

## Core model in one picture

```
User (Neon Auth) ──1:N── Pods  ("Personal", "Work", …)   ← each pod is an isolated memory
                          ├── Namespaces (folder tree, ≤3 levels, ltree path)
                          │      └── Memory entries (namespace + key → value)
                          │             └── Entry versions (history)
                          ├── Agents (= AGENT IDENTITY: name, platform, permissions, status)
                          │      ├── Agent scopes (granted folders → whole subtree)
                          │      └── Agent tokens (credentials: hashed pm_live_ keys)
                          └── Audit events (every read/write/denial)
```

**Access rule (single source of truth, enforced in SQL):** an agent sees an entry only if
`entry.pod = agent.pod` AND the entry's namespace path is **inside** a granted namespace path (`ns.path <@ granted.path`) AND `entry.visibility <> 'private'` AND neither the entry nor the namespace is soft-deleted.

**Pod isolation rule:** a pod is the hard boundary. An agent belongs to exactly one pod, and nothing crosses pods: folders, entries, search, audit, and in v2 dreaming and the graph. An AI that should use two pods gets two agent records (two tokens, two MCP server entries in its client). Every dashboard route and action verifies `pod.owner_user_id = current user` before anything else; this is the human-side counterpart of the agent access rule.

**Ownership rule:** agents manage memory *content* (entries). Users manage *structure and access* (namespaces, pins, visibility, agents) from the dashboard only.

---

## Agent identity

There are two kinds of identity, kept strictly apart:

| | Human (the user) | Agent (Claude, ChatGPT, a bot) |
|---|---|---|
| Identity record | `neon_auth."user"` (managed by Neon Auth) | **`agents` row** (ours) |
| Credential | password / Google / email code → session cookie | **`agent_tokens`**: `pm_live_…` bearer token (v1), OAuth token (v2) |
| Uses | Dashboard only | REST API + MCP only |
| Revocation | Session cookie re-checked every 60s | Token checked on **every** request, so revocation is immediate |

Agents never get Neon Auth accounts: no fake users, passwords or emails.

**An agent = identity + permissions + folder grants. Tokens are only its credentials.**
```
🤖 Agent "Claude – work assistant"          ← agents row (agent_id = 3f9c…)
     platform:     claude
     permissions:  memory:read, memory:write
     folders:      projects/portable-memory, preferences   ← agent_scopes
     status:       active · expires 2027-01-01 · 60 req/min · last seen 2 min ago
     tokens:       pm_live_8f2k… "laptop"   pm_live_x91c… "CI"   ← agent_tokens
     wrote:        14 entries (memory_entries.source_agent_id)
     history:      audit_events where agent_id = 3f9c…
```
- **Permissions on the identity, not the token:** changing an agent's folders applies to all its tokens immediately. Rotating a leaked token keeps the agent's permissions and history.
- **Provenance:** every agent-written entry and version records `source_agent_id`, so the user can see "written by Claude" and undo one agent's writes.
- **Audit:** every event records `agent_id` (who) and `token_id` (which credential).

**Every agent request (REST and MCP alike):**
```
Bearer pm_live_… → HMAC hash → agent_tokens (unknown/revoked/expired → 401)
  → agents (paused/revoked/expired, or its pod deleted → 403) → rate limit (429)
  → permission check (403) → scope filter from agent_scopes (subtree, non-private)
  → query → audit_events(agent_id, token_id, action, namespace, key, outcome)
  → update last_used_at / last_seen_at
```

---

## Database schema — v1

Postgres on Neon, defined in Drizzle at `src/db/schema.ts`, with migrations in `drizzle/`. Extensions: `ltree`, `pg_trgm`. `vector` is added in M7. Shown as SQL for readability.

```sql
-- Many pods per user. owner_user_id = neon_auth."user".id.
-- No cross-schema FK: neon_auth is managed by Neon; keep it loosely coupled.
create table pods (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  name           text not null,                -- "Personal", "Work"
  slug           text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),  -- used in dashboard URLs
  description    text,
  is_default     boolean not null default false,  -- opened after sign-in
  allow_embeddings boolean not null default false,  -- M7 privacy switch, per pod
  deleted_at     timestamptz,                  -- soft delete; also blocks all of the pod's agents
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_user_id, slug)
);
create index on pods (owner_user_id) where deleted_at is null;
create unique index on pods (owner_user_id) where is_default and deleted_at is null;  -- one default

-- Folder tree. path = ancestry of namespace IDs (not names), so renames never touch paths
-- and grants survive renames. Moving a folder rewrites the paths of it and its subfolders.
create table namespaces (
  id                 uuid primary key default gen_random_uuid(),
  pod_id             uuid not null references pods(id) on delete cascade,
  parent_id          uuid references namespaces(id),
  name               text not null check (name ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  path               ltree not null,            -- e.g. n_<uuid>.n_<uuid>
  depth              smallint not null check (depth between 1 and 3),
  description        text,                      -- shown to agents ("what belongs here")
  default_visibility text not null default 'shared',   -- applied to new entries
  agents_can_create  boolean not null default true,    -- false = agents may only update existing keys
  deleted_at         timestamptz,               -- soft delete (restorable ~30 days)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (pod_id, parent_id, name)             -- plus a partial unique index for parent_id is null
);
create index on namespaces using gist (path);

create type visibility as enum ('private', 'shared', 'public');
--  private = dashboard only, never sent to agents
--  shared  = agents granted the namespace
--  public  = reserved; behaves like shared in v1 (user-to-user sharing is out of scope)

create table memory_entries (
  id                    uuid primary key default gen_random_uuid(),
  pod_id                uuid not null references pods(id) on delete cascade,
  namespace_id          uuid not null references namespaces(id),
  key                   text not null check (key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  value                 jsonb not null,            -- string | object | array (spec)
  value_text            text not null,             -- sanitized, flattened text: rendering + search
  visibility            visibility not null default 'shared',
  pinned                boolean not null default false,  -- loaded by get_context
  version               integer not null default 1,      -- optimistic concurrency (save_memory)
  created_by_user       boolean not null,                -- true = dashboard, false = agent
  source_agent_id       uuid references agents(id) on delete set null, -- which agent wrote it
  search_vector         tsvector generated always as (
                          setweight(to_tsvector('simple', key), 'A') ||
                          setweight(to_tsvector('english', value_text), 'B')) stored,
  last_read_at          timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (octet_length(value_text) <= 4096)
);
create unique index on memory_entries (namespace_id, key) where deleted_at is null;
create index on memory_entries using gin (search_vector);
create index on memory_entries using gin (value_text gin_trgm_ops);  -- fuzzy key/value match
create index on memory_entries (pod_id, pinned) where deleted_at is null;

-- Full history: every update and delete keeps the previous value (undo a bad agent write).
create table memory_entry_versions (
  entry_id              uuid not null references memory_entries(id) on delete cascade,
  version               integer not null,
  value                 jsonb not null,
  value_text            text not null,
  changed_by_user       boolean not null,
  source_agent_id       uuid,
  change                text not null,      -- 'create' | 'update' | 'delete' | 'restore'
  created_at            timestamptz not null default now(),
  primary key (entry_id, version)
);

-- AGENT IDENTITY: who the agent is + what it may do. (The spec's "Agent Connection".)
-- Permissions live here, never inside tokens. One row per agent the user connects.
create table agents (
  id                 uuid primary key default gen_random_uuid(),   -- = agent_id in the audit log
  pod_id             uuid not null references pods(id) on delete cascade,
  name               text not null,                 -- "Claude – work assistant"
  platform           text not null,                 -- claude | chatgpt | cursor | custom | other
  description        text,                          -- user's note: what this agent is for
  created_via        text not null default 'dashboard', -- dashboard | oauth (v2)
  permissions        text[] not null,               -- memory:read|write|delete|list, audit:read
  all_namespaces     boolean not null default false, -- grant whole tree incl. future folders
  status             text not null default 'active', -- active | paused | revoked
  expires_at         timestamptz,
  rate_limit_per_min integer not null default 60,
  last_seen_at       timestamptz,                    -- last authenticated request (any token)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (pod_id, name)
);

-- The agent's folder grants. A grant on a namespace covers its whole subtree, now and in future.
create table agent_scopes (
  agent_id      uuid not null references agents(id) on delete cascade,
  namespace_id  uuid not null references namespaces(id) on delete cascade,
  primary key (agent_id, namespace_id)
);

-- The agent's CREDENTIALS: proof that a request comes from this agent. An agent can hold several
-- (laptop, CI); rotating or revoking one never touches the agent's identity, permissions or history.
-- Opaque random tokens checked against the DB on every request (instant revocation).
create table agent_tokens (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references agents(id) on delete cascade,
  token_hash     bytea not null unique,     -- HMAC-SHA256(token, TOKEN_PEPPER); raw token shown once
  prefix         text not null,             -- "pm_live_8f2k" for display
  label          text,                      -- "laptop", "CI"
  last_used_at   timestamptz,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- Append-only audit trail (spec: agent_id, action, namespace, key, timestamp).
-- Names are snapshotted so history stays readable after renames and deletes.
create table audit_events (
  id              bigint generated always as identity primary key,
  pod_id          uuid not null references pods(id) on delete cascade,
  actor_type      text not null,           -- 'agent' | 'user'
  agent_id        uuid,                    -- spec: agent_id
  token_id        uuid,                    -- which of the agent's tokens was used
  action          text not null,           -- context|search|read|list|write|delete|denied|token.create|scope.change…
  namespace_id    uuid,
  namespace_path  text,                    -- human path snapshot, e.g. "projects/garden"
  key             text,
  outcome         text not null,           -- 'ok' | 'denied' | 'not_found' | 'rate_limited' | 'conflict'
  detail          jsonb,                   -- e.g. {"query": "...", "results": 3}; never memory values
  created_at      timestamptz not null default now()
);
create index on audit_events (pod_id, created_at desc);
create index on audit_events (agent_id, created_at desc);

-- Simple per-agent fixed-window rate limiting.
create table rate_limit_windows (
  agent_id       uuid not null references agents(id) on delete cascade,
  window_start   timestamptz not null,
  count          integer not null,
  primary key (agent_id, window_start)
);
```

**Added in M7 (end of v1):**
```sql
create extension vector;
alter table memory_entries add column embedding vector(<dims>), add column embedding_model text;
create index on memory_entries using hnsw (embedding vector_cosine_ops);
```
The dimension is set by the chosen embedding model; choosing the provider is part of M7.

**First pod:** a "Personal" pod (`is_default`) is created on the user's first dashboard visit. Users can create more pods and pick which one is the default.

**Default namespaces created with each new pod:** `identity`, `preferences`, `projects`, `work`, `health` (default_visibility `private`), `notes`.

---

## Architecture (v1)

```
Dashboard (human, Neon Auth session)     REST /api/v1/memory…      MCP /api/mcp
          │ Server Actions / Route Handlers        │ bearer pm_live_      │ bearer pm_live_
          ▼                                        ▼                      ▼
   src/lib/memory/*  ← ONE core layer: authorize → scope filter → sanitize → query → audit
          ▼
   Drizzle + @neondatabase/serverless → Neon Postgres
```

- `src/db/` — `schema.ts`, `client.ts` (serverless Pool for transactions), migrations config.
- `src/lib/memory/` — `pods.ts` (list the user's pods, create the first one, pod CRUD, ownership check), `namespaces.ts` (tree CRUD, move, rename, soft delete), `entries.ts` (CRUD + versions), `scope.ts` (builds the access-rule SQL fragment), `sanitize.ts`, `render.ts` (Markdown for `get_context`), `search.ts`, `audit.ts`.
- `src/lib/agents/` — `tokens.ts` (generate, HMAC hash, verify), `authenticate.ts` (token → agent → status/expiry → rate limit), `permissions.ts`.
- `src/app/api/v1/memory/...` — REST adapter (spec endpoints, versioned under `/v1`).
- `src/app/api/mcp/route.ts` — MCP adapter with 5 tools.
- Dashboard routes are pod-scoped, so the URL shows which pod you're in: `src/app/(app)/p/[pod]/memory`, `.../p/[pod]/agents`, `.../p/[pod]/audit`, plus `/pods` (list, create). Add `/p/:path*` and `/pods` to `src/proxy.ts`'s matcher. A pod switcher goes in the header; `/dashboard` redirects to the default pod. `[pod]` is a request-time param under Cache Components, so it's read inside `<Suspense>`.
- The agent API carries **no pod in the URL**: the token identifies the agent, and the agent identifies its pod.

**Reuse from the existing auth work:**
- `requireUser` / `requireApiUser` / `getCurrentUser` in `src/lib/auth/session.ts` for every dashboard read and action. Add `requirePod(slug)` next to them: resolves the pod **and** checks it belongs to the current user; it returns 404 (not 403) for someone else's pod, so pod IDs can't be probed.
- `FormState`, `field`, `secret` in `src/lib/auth/errors.ts`; consider moving the generic helpers to `src/lib/forms.ts`.
- `Field`, `SubmitButton`, `FormAlert`, `Alert` in `src/components/ui/form.tsx`, and `buttonClass` in `src/components/ui/styles.ts`.
- Patterns already proven in this app:
  - session reads behind `<Suspense>`, never `force-dynamic` (Cache Components);
  - no Neon Auth SDK calls that hit upstream during Server Component render (see `src/lib/auth/account.ts`);
  - refresh from the client after an action.

---

## v1 milestones

**M0 — Foundations**
- Clean up the package manager: keep pnpm, delete `package-lock.json`, set `packageManager`.
- Read the Drizzle and Neon Postgres skills/docs (`find-skills`; the `neon-postgres` skill).
- Add drizzle-orm, drizzle-kit, @neondatabase/serverless and zod. Create `src/db/*`, the `ltree` and `pg_trgm` extensions, and the migrations.
- Add `TOKEN_PEPPER` to env.
- Verify drizzle-kit can reach Neon over 443; if not, run migrations through the serverless driver.
- Create the first "Personal" pod (with default namespaces) on first dashboard visit, idempotently.

**M0.5 — Pods (dashboard)**
- `/pods`: list, create (name, slug, description; seeded with default namespaces), rename, set default, delete (typed confirmation, soft delete; immediately blocks all of that pod's agents).
- Header pod switcher; `/dashboard` redirects to `/p/<default>/memory`.

**M1 — Namespaces (dashboard)**
- `/memory` shows the folder tree with entry counts and "who can see this" (agents whose grants cover it).
- Create (with the "grant to which agents?" step), rename, edit description and settings, move (with a visibility-change warning), and delete (typed confirmation, "move entries first" option, soft delete).
- Enforce at most 3 levels and the name rules.

**M2 — Entries (dashboard)**
- Create, edit and delete entries in a folder.
- Toggle pin and visibility.
- Version history with restore.
- Values are text or JSON, max 4 KB, sanitized.

**M3 — Agents & tokens (dashboard)**
- `/agents`: add an agent (name, platform, description, permissions, folders or "all", expiry, rate limit), edit, pause, revoke. Agent detail page shows its grants, tokens, last seen, and its audit trail.
- Tokens: issue (shown once, with the MCP URL and config snippets), label, revoke, last used.

**M4 — Memory core + REST API**
- `authenticate.ts` and the scope filter.
- Endpoints: `GET /api/v1/memory` (list), `GET /api/v1/memory/{ns-path}` (keys), and `GET|PUT|DELETE /api/v1/memory/{ns-path}/{key}`.
- `PUT` supports `If-Match` versioning (409 on conflict) and respects `agents_can_create`.
- Status codes: 401 unknown/revoked, 403 paused/expired/no permission/out of scope, 404, 409, 429.
- Responses are minimal.

**M5 — Audit**
- Every core operation writes an `audit_events` row, including denials.
- `/audit` page: filter by agent, action, folder and date.
- The dashboard's own edits are logged as `actor_type='user'`.

**M6 — MCP server**
- `/api/mcp` with Streamable HTTP and bearer tokens. Tools:
  - `get_context`: pinned entries as Markdown, plus an index of other keys and folder descriptions;
  - `search_memory`: full-text search in v1;
  - `get_memory`;
  - `save_memory`: upsert with optional `expected_version`;
  - `forget_memory`: soft delete.
- Tools are listed only if the agent's permissions allow them.
- Before building, read the MCP SDK / mcp-handler docs for the installed versions.

**M7 — Semantic layer (end of v1)**
- Choose an embedding provider and model, via the AI SDK `embed` (already a dependency: `ai`).
- Add the `vector` column and HNSW index, and backfill existing entries.
- `search_memory` becomes hybrid (full-text + vector, merged with reciprocal rank fusion), filtered by scope first.
- `save_memory` checks for near-duplicates (cosine similarity above a threshold): it returns the existing entry instead of creating a duplicate.
- Per-pod setting `pods.allow_embeddings` (privacy), shown in the dashboard. Pods with it off stay on keyword search only.

---

## v2 — schema additions & features

**Procedural memory** (how the user wants things done)
```sql
alter table memory_entries
  add column kind   text not null default 'fact',   -- fact | event | procedure
  add column status text not null default 'live',   -- live | draft | rejected
  add column procedure_when text;                    -- trigger description (indexed for search)
alter table namespaces add column require_approval boolean not null default false;
```
- Agent writes into folders that require approval become `draft` and are served to no agent until the user approves them in a review queue (with a diff against the live version).
- `get_context` lists procedures as name + `when`, and agents fetch the full steps with `get_memory`.

**Dreaming** (background consolidation, like sleep)
- A scheduled job per pod, for example nightly or after N writes (runtime decided at v2 start: Neon Function Trigger or Vercel cron). It uses an LLM via the AI SDK and **only produces suggestions**; the user approves them.
- Suggestion types:
  - merge duplicates;
  - flag contradictions ("vegetarian" vs a newer note about eating fish);
  - flag stale entries (`last_read_at`);
  - promote recurring notes into facts or procedures;
  - extract graph entities and relations.
```sql
create table dream_runs (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null,                 -- running | done | failed
  stats jsonb                           -- entries scanned, suggestions made, tokens used
);
create table dream_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references dream_runs(id) on delete cascade,
  pod_id uuid not null references pods(id) on delete cascade,
  type text not null,                   -- merge | contradiction | stale | promote | graph
  entry_ids uuid[] not null,            -- entries involved
  proposal jsonb not null,              -- e.g. merged value, new procedure, graph triples
  rationale text not null,
  status text not null default 'pending',  -- pending | accepted | dismissed
  decided_at timestamptz
);
```

**Knowledge graph** (entities and relations derived from entries; plain tables, no AGE)
```sql
create table kg_entities (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  type text not null,                   -- person | project | place | org | tool | concept
  name text not null,
  aliases text[] not null default '{}',
  embedding vector(<dims>),
  unique (pod_id, type, name)
);
create table kg_relations (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  subject_id uuid not null references kg_entities(id) on delete cascade,
  predicate text not null,              -- works_on | uses | lives_in | prefers | decided …
  object_id uuid not null references kg_entities(id) on delete cascade,
  source_entry_id uuid not null references memory_entries(id) on delete cascade,
  confidence real not null,
  created_at timestamptz not null default now()
);
create table kg_mentions (               -- which entries mention which entities
  entity_id uuid not null references kg_entities(id) on delete cascade,
  entry_id  uuid not null references memory_entries(id) on delete cascade,
  primary key (entity_id, entry_id)
);
```
- **Access rule for the graph:** a relation is visible only if its `source_entry_id` is visible to the agent; an entity is visible only if at least one visible entry mentions it. The graph never reveals anything the entries don't, which matters because sibling projects must not leak through the graph.
- New MCP tool `explore_memory(entity, depth ≤ 2)`, implemented with recursive CTEs over `kg_relations`, scope-filtered.
- Relations are created by dreaming suggestions or on write, and every one links back to its source entry so it can be audited and removed.

**Also in v2:**
- **OAuth 2.1 for MCP:** our own authorization server; the consent screen creates an agent (`created_via='oauth'`); tables `oauth_clients`, `oauth_codes`, `oauth_tokens` (hashed) point to `agents`.
- **Encryption at rest** (from the spec). This conflicts with server-side embeddings and the graph, so it needs its own design pass.
- **Object Storage ingestion:** files are split into entries that link back to the stored object.
- **Realtime:** live audit feed and live memory updates in the dashboard.
- **`audit:read` for agents**, if a use case appears.

---

## Verification

Each milestone adds tests and is checked against the real Neon branch (or a Neon dev branch created for testing, so the `production` branch stays clean):
- **Unit (Vitest):** the scope filter (subtree grants, sibling exclusion, parent-entry exclusion, private, soft-deleted), token hashing and verification, sanitize, the Markdown renderer.
- **Integration (Vitest against a Neon dev branch):** the access-rule matrix from the design examples (Claude: `projects/portable-memory` only; ChatGPT: `projects`; bot: `projects/garden`), asserting exact visible sets for list, search, get_context and get. Also rename keeps grants, move warns and changes visibility, and namespace delete drops grants.
- **Pod isolation:** two pods with identical folder names; an agent of pod A sees nothing from pod B in list, search, get or save. User B gets 404 for user A's `/p/<slug>/…` pages and actions. Deleting a pod makes its agents' next request fail.
- **REST e2e (curl script):** every status code (401/403/404/409/429); revoking a token blocks the very next request; every call produces exactly one audit row.
- **MCP e2e:** connect with the official MCP SDK client using a bearer token; confirm the tool list matches the permissions and run each tool. Then a manual check from Claude Code (`claude mcp add --transport http … --header "Authorization: Bearer …"`).
- **Dashboard e2e:** move the Playwright auth e2e script used to verify login into the repo (`e2e/`) and extend it with flows for creating a folder, creating an entry, adding an agent, revealing a token, and viewing the audit log.
- **Every milestone:** `pnpm build` with 0 errors, `pnpm lint`, `tsc --noEmit`.
