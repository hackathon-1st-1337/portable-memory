/**
 * Portable Memory — database schema (v1)
 *
 * Defined with Drizzle ORM. Extensions required:
 *   ltree, pg_trgm   (both available on Neon)
 *   vector           (added in M7, migration file 0002_vector.sql)
 *
 * Naming convention: snake_case columns, camelCase Drizzle field names.
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  smallint,
  timestamp,
  jsonb,
  bigint,
  primaryKey,
  uniqueIndex,
  index,
  customType,
  pgEnum,
  real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Custom Postgres types
// ---------------------------------------------------------------------------

/** timestamptz helper */
const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/** bytea type */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** ltree — hierarchical label tree path, e.g. "n_<uuid>.n_<uuid>" */
const ltree = customType<{ data: string }>({
  dataType() {
    return "ltree";
  },
});

/** tsvector — stored generated full-text search vector */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** vector — pgvector 1536-dimensional float vector */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (!value) return [];
    return value.replace(/^\[|\]$/g, "").split(",").map(Number);
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const visibilityEnum = pgEnum("visibility", [
  "private",
  "shared",
  "public",
]);
//  private = dashboard only, never sent to agents
//  shared  = agents granted the namespace
//  public  = reserved; behaves like shared in v1

// ---------------------------------------------------------------------------
// pods — one or more memory pods per user (Personal, Work, …)
// owner_user_id = neon_auth."user".id (no cross-schema FK)
// ---------------------------------------------------------------------------

export const pods = pgTable(
  "pods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull(),
    name: text("name").notNull(),
    /** Used in dashboard URLs, e.g. /p/work/memory */
    slug: text("slug").notNull(),
    description: text("description"),
    /** Pod opened after sign-in */
    isDefault: boolean("is_default").notNull().default(false),
    /** Per-pod privacy switch for embeddings (M7) */
    allowEmbeddings: boolean("allow_embeddings").notNull().default(false),
    /** Soft delete — also blocks all of the pod's agents */
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pods_owner_slug_unique").on(t.ownerUserId, t.slug),
    // Only one active default pod per user
    uniqueIndex("pods_owner_default_unique")
      .on(t.ownerUserId)
      .where(sql`${t.isDefault} AND ${t.deletedAt} IS NULL`),
    index("pods_owner_active_idx").on(t.ownerUserId).where(sql`${t.deletedAt} IS NULL`),
  ]
);

// ---------------------------------------------------------------------------
// namespaces — folder tree (≤ 3 levels deep), paths use ltree
// path stores ancestry of namespace IDs so renames never touch paths.
// Moving a folder rewrites its path and all descendants.
// ---------------------------------------------------------------------------

export const namespaces = pgTable(
  "namespaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // self-reference; added as FK separately in migration
    /** Lowercase alphanumeric + hyphens, 1-40 chars */
    name: text("name").notNull(),
    /** e.g. n_<uuid>.n_<uuid> — stable across renames */
    path: ltree("path").notNull(),
    /** 1 = root, 2 = child, 3 = grandchild (max) */
    depth: smallint("depth").notNull(),
    /** Shown to agents as a description of what belongs here */
    description: text("description"),
    /** Applied to new entries created inside this namespace */
    defaultVisibility: text("default_visibility").notNull().default("shared"),
    /** false = agents may only update existing keys, not create new ones */
    agentsCanCreate: boolean("agents_can_create").notNull().default(true),
    /** v2: Agent writes require user approval before becoming live */
    requireApproval: boolean("require_approval").notNull().default(false),
    /** Soft delete (restorable ~30 days) */
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Unique name per parent per pod; handled via two indexes:
    // 1) non-root: (pod_id, parent_id, name) unique
    // 2) root (parent_id IS NULL): (pod_id, name) unique — enforced in migration
    uniqueIndex("namespaces_pod_parent_name_unique").on(
      t.podId,
      t.parentId,
      t.name
    ),
    // GiST index for ltree ancestor/descendant queries
    index("namespaces_path_gist_idx").using("gist", t.path),
  ]
);

// ---------------------------------------------------------------------------
// memory_entries — one entry per (namespace, key) pair
// ---------------------------------------------------------------------------

export const memoryEntries = pgTable(
  "memory_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id),
    /** Lowercase alphanumeric + dots/hyphens/underscores, 1-80 chars */
    key: text("key").notNull(),
    /** string | object | array (stored as JSONB) */
    value: jsonb("value").notNull(),
    /** Sanitized, flattened text for rendering + search */
    valueText: text("value_text").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("shared"),
    /** Loaded by get_context */
    pinned: boolean("pinned").notNull().default(false),
    /** v2: fact | event | procedure */
    kind: text("kind").notNull().default("fact"),
    /** v2: live | draft | rejected */
    status: text("status").notNull().default("live"),
    /** v2: Trigger description for procedures (e.g. "when drafting release notes") */
    procedureWhen: text("procedure_when"),
    /** Optimistic concurrency (used by save_memory expected_version) */
    version: integer("version").notNull().default(1),
    /** true = created via dashboard, false = created by agent */
    createdByUser: boolean("created_by_user").notNull(),
    /** Which agent wrote this entry (null = user) */
    sourceAgentId: uuid("source_agent_id"), // FK to agents added in migration (circular dep)
    /** Generated tsvector for full-text search — updated via trigger in migration */
    searchVector: tsvector("search_vector"),
    /** Semantic vector embedding (M7) */
    embedding: vector("embedding"),
    embeddingModel: text("embedding_model"),
    lastReadAt: timestamptz("last_read_at"),
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memory_entries_ns_key_unique")
      .on(t.namespaceId, t.key)
      .where(sql`${t.deletedAt} IS NULL`),
    index("memory_entries_search_vector_gin_idx").using("gin", t.searchVector),
    index("memory_entries_pod_pinned_idx")
      .on(t.podId, t.pinned)
      .where(sql`${t.deletedAt} IS NULL`),
    index("memory_entries_kind_idx")
      .on(t.podId, t.kind)
      .where(sql`${t.deletedAt} IS NULL`),
    index("memory_entries_status_idx")
      .on(t.podId, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
  ]
);

// ---------------------------------------------------------------------------
// memory_entry_versions — full history (every update/delete keeps old value)
// ---------------------------------------------------------------------------

export const memoryEntryVersions = pgTable(
  "memory_entry_versions",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => memoryEntries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    value: jsonb("value").notNull(),
    valueText: text("value_text").notNull(),
    changedByUser: boolean("changed_by_user").notNull(),
    sourceAgentId: uuid("source_agent_id"),
    /** 'create' | 'update' | 'delete' | 'restore' */
    change: text("change").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.version] })]
);

// ---------------------------------------------------------------------------
// agents — AGENT IDENTITY: name + permissions + status.
// Tokens are separate credentials; permissions live here, not on tokens.
// ---------------------------------------------------------------------------

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** claude | chatgpt | cursor | custom | other */
    platform: text("platform").notNull(),
    description: text("description"),
    /** dashboard | oauth (v2) */
    createdVia: text("created_via").notNull().default("dashboard"),
    /** memory:read | memory:write | memory:delete | memory:list | audit:read */
    permissions: text("permissions").array().notNull(),
    /** Grant access to whole tree including future folders */
    allNamespaces: boolean("all_namespaces").notNull().default(false),
    /** active | paused | revoked */
    status: text("status").notNull().default("active"),
    expiresAt: timestamptz("expires_at"),
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
    /** Last authenticated request (any token) */
    lastSeenAt: timestamptz("last_seen_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agents_pod_name_unique").on(t.podId, t.name)]
);

// ---------------------------------------------------------------------------
// agent_scopes — folder grants.
// A grant on a namespace covers its entire subtree (now and future).
// ---------------------------------------------------------------------------

export const agentScopes = pgTable(
  "agent_scopes",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.namespaceId] })]
);

// ---------------------------------------------------------------------------
// agent_tokens — CREDENTIALS only (not identity).
// Raw token shown once; stored as HMAC-SHA256 hash.
// prefix = "pm_live_8f2k" for display; label = "laptop", "CI", …
// ---------------------------------------------------------------------------

export const agentTokens = pgTable("agent_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  /** HMAC-SHA256(raw_token, TOKEN_PEPPER) */
  tokenHash: bytea("token_hash").notNull().unique(),
  /** First 12 chars of the pm_live_ token for display */
  prefix: text("prefix").notNull(),
  label: text("label"),
  lastUsedAt: timestamptz("last_used_at"),
  expiresAt: timestamptz("expires_at"),
  revokedAt: timestamptz("revoked_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// audit_events — append-only audit trail.
// Names are snapshotted so history stays readable after renames/deletes.
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    /** 'agent' | 'user' */
    actorType: text("actor_type").notNull(),
    agentId: uuid("agent_id"),
    tokenId: uuid("token_id"),
    /** context | search | read | list | write | delete | denied | token.create | scope.change */
    action: text("action").notNull(),
    namespaceId: uuid("namespace_id"),
    /** Human-readable path snapshot, e.g. "projects/garden" */
    namespacePath: text("namespace_path"),
    key: text("key"),
    /** 'ok' | 'denied' | 'not_found' | 'rate_limited' | 'conflict' */
    outcome: text("outcome").notNull(),
    /** e.g. {query: "...", results: 3}; never memory values */
    detail: jsonb("detail"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_pod_time_idx").on(t.podId, t.createdAt),
    index("audit_events_agent_time_idx").on(t.agentId, t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// rate_limit_windows — simple per-agent fixed-window rate limiting
// ---------------------------------------------------------------------------

export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.windowStart] })]
);

// ---------------------------------------------------------------------------
// v2: dream_runs & dream_suggestions (Background Consolidation)
// ---------------------------------------------------------------------------

export const dreamRuns = pgTable(
  "dream_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    finishedAt: timestamptz("finished_at"),
    /** 'running' | 'done' | 'failed' */
    status: text("status").notNull(),
    stats: jsonb("stats"),
  },
  (t) => [index("dream_runs_pod_idx").on(t.podId, t.startedAt)]
);

export const dreamSuggestions = pgTable(
  "dream_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => dreamRuns.id, { onDelete: "cascade" }),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    /** 'merge' | 'contradiction' | 'stale' | 'promote' | 'graph' */
    type: text("type").notNull(),
    entryIds: customType<{ data: string[] }>({
      dataType() {
        return "uuid[]";
      },
    })("entry_ids").notNull(),
    proposal: jsonb("proposal").notNull(),
    rationale: text("rationale").notNull(),
    /** 'pending' | 'accepted' | 'dismissed' */
    status: text("status").notNull().default("pending"),
    decidedAt: timestamptz("decided_at"),
  },
  (t) => [index("dream_suggestions_pod_status_idx").on(t.podId, t.status)]
);

// ---------------------------------------------------------------------------
// v2: Knowledge Graph (kg_entities, kg_relations, kg_mentions)
// ---------------------------------------------------------------------------

export const kgEntities = pgTable(
  "kg_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    /** person | project | place | org | tool | concept */
    type: text("type").notNull(),
    name: text("name").notNull(),
    aliases: customType<{ data: string[] }>({
      dataType() {
        return "text[]";
      },
    })("aliases").notNull().default([]),
    embedding: vector("embedding"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("kg_entities_pod_type_name_unique").on(t.podId, t.type, t.name),
    index("kg_entities_pod_name_idx").on(t.podId, t.name),
  ]
);

export const kgRelations = pgTable(
  "kg_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => kgEntities.id, { onDelete: "cascade" }),
    predicate: text("predicate").notNull(),
    objectId: uuid("object_id")
      .notNull()
      .references(() => kgEntities.id, { onDelete: "cascade" }),
    sourceEntryId: uuid("source_entry_id")
      .notNull()
      .references(() => memoryEntries.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("kg_relations_pod_subject_idx").on(t.podId, t.subjectId),
    index("kg_relations_pod_object_idx").on(t.podId, t.objectId),
    index("kg_relations_source_entry_idx").on(t.sourceEntryId),
  ]
);

export const kgMentions = pgTable(
  "kg_mentions",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => kgEntities.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => memoryEntries.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.entryId] })]
);

// ---------------------------------------------------------------------------
// v2: OAuth 2.1 (oauth_clients, oauth_authorization_codes, oauth_tokens)
// ---------------------------------------------------------------------------

export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: bytea("client_secret_hash"),
  name: text("name").notNull(),
  redirectUris: customType<{ data: string[] }>({
    dataType() {
      return "text[]";
    },
  })("redirect_uris").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id").notNull(),
  podId: uuid("pod_id")
    .notNull()
    .references(() => pods.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  usedAt: timestamptz("used_at"),
});

export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: bytea("token_hash").notNull().unique(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// v2: s3_objects (Object Storage metadata & ingestion)
// ---------------------------------------------------------------------------

export const s3Objects = pgTable(
  "s3_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    podId: uuid("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    s3Key: text("s3_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sourceEntryId: uuid("source_entry_id").references(() => memoryEntries.id, {
      onDelete: "set null",
    }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("s3_objects_pod_idx").on(t.podId, t.createdAt)]
);

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

export type Pod = typeof pods.$inferSelect;
export type NewPod = typeof pods.$inferInsert;
export type Namespace = typeof namespaces.$inferSelect;
export type NewNamespace = typeof namespaces.$inferInsert;
export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type NewMemoryEntry = typeof memoryEntries.$inferInsert;
export type MemoryEntryVersion = typeof memoryEntryVersions.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentScope = typeof agentScopes.$inferSelect;
export type AgentToken = typeof agentTokens.$inferSelect;
export type NewAgentToken = typeof agentTokens.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type DreamRun = typeof dreamRuns.$inferSelect;
export type NewDreamRun = typeof dreamRuns.$inferInsert;
export type DreamSuggestion = typeof dreamSuggestions.$inferSelect;
export type NewDreamSuggestion = typeof dreamSuggestions.$inferInsert;
export type KgEntity = typeof kgEntities.$inferSelect;
export type NewKgEntity = typeof kgEntities.$inferInsert;
export type KgRelation = typeof kgRelations.$inferSelect;
export type NewKgRelation = typeof kgRelations.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthCode = typeof oauthAuthorizationCodes.$inferSelect;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type S3Object = typeof s3Objects.$inferSelect;

