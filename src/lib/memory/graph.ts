import "server-only";

import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  kgEntities,
  kgRelations,
  kgMentions,
  memoryEntries,
  namespaces,
  type KgEntity,
  type KgRelation,
  type Agent,
} from "@/db/schema";
import { buildAgentScopeFilter } from "./scope";
import { generateEmbedding } from "./embeddings";

export interface ExploredRelation {
  id: string;
  predicate: string;
  subjectName: string;
  subjectType: string;
  objectName: string;
  objectType: string;
  confidence: number;
  sourceEntryKey: string;
  sourceNamespaceName: string;
}

export interface ExploredGraph {
  rootEntity: KgEntity;
  connectedEntities: KgEntity[];
  relations: ExploredRelation[];
}

/**
 * Create or retrieve an entity in the Knowledge Graph.
 */
export async function createOrGetEntity(
  podId: string,
  type: "person" | "project" | "place" | "org" | "tool" | "concept" | string,
  name: string,
  aliases: string[] = []
): Promise<KgEntity> {
  const cleanName = name.trim();
  const cleanType = type.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(kgEntities)
    .where(
      and(
        eq(kgEntities.podId, podId),
        eq(kgEntities.type, cleanType),
        sql`LOWER(${kgEntities.name}) = LOWER(${cleanName})`
      )
    )
    .limit(1);

  if (existing) {
    if (aliases.length > 0) {
      const mergedAliases = Array.from(new Set([...(existing.aliases || []), ...aliases]));
      await db
        .update(kgEntities)
        .set({ aliases: mergedAliases })
        .where(eq(kgEntities.id, existing.id));
      existing.aliases = mergedAliases;
    }
    return existing;
  }

  // Generate vector embedding for entity
  let vector: number[] | null = null;
  try {
    const { embedding } = await generateEmbedding(`${cleanType}: ${cleanName}`);
    vector = embedding;
  } catch {
    // optional embedding
  }

  const [created] = await db
    .insert(kgEntities)
    .values({
      podId,
      type: cleanType,
      name: cleanName,
      aliases,
      embedding: vector || undefined,
    })
    .returning();

  return created;
}

/**
 * Create a relation in the Knowledge Graph linking two entities back to a source entry.
 */
export async function createRelation(
  podId: string,
  subjectId: string,
  predicate: string,
  objectId: string,
  sourceEntryId: string,
  confidence = 1.0
): Promise<KgRelation> {
  const [relation] = await db
    .insert(kgRelations)
    .values({
      podId,
      subjectId,
      predicate: predicate.trim().toLowerCase(),
      objectId,
      sourceEntryId,
      confidence: Math.max(0.1, Math.min(1.0, confidence)),
    })
    .returning();

  // Also record mentions
  await db
    .insert(kgMentions)
    .values([
      { entityId: subjectId, entryId: sourceEntryId },
      { entityId: objectId, entryId: sourceEntryId },
    ])
    .onConflictDoNothing();

  return relation;
}

/**
 * Explore memory through the Knowledge Graph (used by MCP explore_memory and graph UI).
 * Enforces the core access rule:
 * - A relation is visible only if its source_entry_id is accessible to the agent!
 * - Sibling projects and ungranted namespaces never leak through the graph.
 */
export async function exploreMemory(
  podId: string,
  entityQuery: string,
  depth = 1,
  agent?: Agent
): Promise<ExploredGraph | null> {
  const cleanQuery = entityQuery.trim().toLowerCase();
  if (!cleanQuery) return null;

  // 1. Locate the root entity (exact name match or alias match or fuzzy match)
  const rootRows = await db
    .select()
    .from(kgEntities)
    .where(
      and(
        eq(kgEntities.podId, podId),
        sql`LOWER(${kgEntities.name}) = ${cleanQuery} OR ${cleanQuery} = ANY(SELECT LOWER(unnest(aliases)))`
      )
    )
    .limit(1);

  let root = rootRows[0];
  if (!root) {
    // Try substring match
    const fuzzyRows = await db
      .select()
      .from(kgEntities)
      .where(
        and(
          eq(kgEntities.podId, podId),
          sql`LOWER(${kgEntities.name}) LIKE '%' || ${cleanQuery} || '%'`
        )
      )
      .limit(1);
    root = fuzzyRows[0];
  }

  if (!root) return null;

  // 2. Fetch relations connected to the root entity
  // If agent is specified, enforce scope condition on source_entry_id
  const scopeCondition = agent
    ? buildAgentScopeFilter(agent)
    : sql`memory_entries.pod_id = ${podId} AND memory_entries.deleted_at IS NULL AND namespaces.deleted_at IS NULL`;

  const relationQuery = sql`
    SELECT
      r.id,
      r.predicate,
      r.confidence,
      s.id as subject_id,
      s.name as subject_name,
      s.type as subject_type,
      o.id as object_id,
      o.name as object_name,
      o.type as object_type,
      memory_entries.key as source_entry_key,
      namespaces.name as source_namespace_name
    FROM kg_relations r
    JOIN kg_entities s ON r.subject_id = s.id
    JOIN kg_entities o ON r.object_id = o.id
    JOIN memory_entries ON r.source_entry_id = memory_entries.id
    JOIN namespaces ON memory_entries.namespace_id = namespaces.id
    WHERE r.pod_id = ${podId}
      AND (r.subject_id = ${root.id} OR r.object_id = ${root.id})
      AND ${scopeCondition}
    ORDER BY r.confidence DESC, r.created_at DESC
    LIMIT 30
  `;

  const result = await db.execute(relationQuery);
  const rawRows = (result.rows as any[]) || [];

  const relations: ExploredRelation[] = rawRows.map((row) => ({
    id: row.id,
    predicate: row.predicate,
    subjectName: row.subject_name,
    subjectType: row.subject_type,
    objectName: row.object_name,
    objectType: row.object_type,
    confidence: Number(row.confidence),
    sourceEntryKey: row.source_entry_key,
    sourceNamespaceName: row.source_namespace_name,
  }));

  // Collect connected entity IDs
  const connectedIds = new Set<string>();
  for (const r of rawRows) {
    if (r.subject_id !== root.id) connectedIds.add(r.subject_id);
    if (r.object_id !== root.id) connectedIds.add(r.object_id);
  }

  const connectedEntities =
    connectedIds.size > 0
      ? await db
          .select()
          .from(kgEntities)
          .where(and(eq(kgEntities.podId, podId), inArray(kgEntities.id, Array.from(connectedIds))))
      : [];

  return {
    rootEntity: root,
    connectedEntities,
    relations,
  };
}

/**
 * List all entities in a pod with relation counts.
 */
export async function listEntities(podId: string) {
  return db
    .select()
    .from(kgEntities)
    .where(eq(kgEntities.podId, podId))
    .orderBy(desc(kgEntities.createdAt))
    .limit(100);
}

/**
 * List relations in a pod for dashboard display.
 */
export async function listPodRelations(podId: string) {
  const result = await db.execute(sql`
    SELECT
      r.id,
      r.predicate,
      r.confidence,
      s.name as subject_name,
      s.type as subject_type,
      o.name as object_name,
      o.type as object_type,
      memory_entries.key as source_entry_key,
      namespaces.name as source_namespace_name
    FROM kg_relations r
    JOIN kg_entities s ON r.subject_id = s.id
    JOIN kg_entities o ON r.object_id = o.id
    JOIN memory_entries ON r.source_entry_id = memory_entries.id
    JOIN namespaces ON memory_entries.namespace_id = namespaces.id
    WHERE r.pod_id = ${podId}
      AND memory_entries.deleted_at IS NULL
      AND namespaces.deleted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 100
  `);

  return (result.rows as any[]) || [];
}
