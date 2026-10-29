import "server-only";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memoryEntries, namespaces, pods, type Agent } from "@/db/schema";
import { buildAgentScopeFilter } from "./scope";
import { generateEmbedding } from "./embeddings";

export interface SearchResult {
  id: string;
  namespaceId: string;
  namespaceName: string;
  namespacePath: string;
  key: string;
  value: unknown;
  valueText: string;
  pinned: boolean;
  version: number;
  rank: number;
}

/**
 * Hybrid search across memory entries:
 * - If pod.allow_embeddings is true: combines full-text search with vector cosine similarity (hybrid RRF).
 * - If pod.allow_embeddings is false: uses keyword full-text search + trigram fuzzy match.
 * Always filters by agent scope first.
 */
export async function searchMemory(
  podId: string,
  query: string,
  options: {
    agent?: Agent;
    limit?: number;
  } = {}
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.min(options.limit ?? 20, 50);

  // Check if pod allows embeddings
  const podRows = await db
    .select({ allowEmbeddings: pods.allowEmbeddings })
    .from(pods)
    .where(eq(pods.id, podId))
    .limit(1);

  const allowEmbeddings = podRows[0]?.allowEmbeddings ?? false;

  // Scope filter: agent scope vs user dashboard scope
  const scopeCondition = options.agent
    ? buildAgentScopeFilter(options.agent)
    : sql`memory_entries.pod_id = ${podId} AND memory_entries.deleted_at IS NULL AND namespaces.deleted_at IS NULL`;

  if (allowEmbeddings) {
    // Generate embedding for query
    const { embedding } = await generateEmbedding(cleanQuery);
    const vectorStr = `[${embedding.join(",")}]`;

    // Hybrid SQL: Full-text search + pgvector cosine similarity
    const rows = await db.execute(sql`
      SELECT
        memory_entries.id,
        memory_entries.namespace_id,
        namespaces.name as namespace_name,
        namespaces.path::text as namespace_path,
        memory_entries.key,
        memory_entries.value,
        memory_entries.value_text,
        memory_entries.pinned,
        memory_entries.version,
        (
          COALESCE(ts_rank(memory_entries.search_vector, plainto_tsquery('english', ${cleanQuery})), 0.0) * 1.5 +
          COALESCE(similarity(memory_entries.value_text, ${cleanQuery}), 0.0) +
          CASE WHEN memory_entries.key ILIKE '%' || ${cleanQuery} || '%' THEN 1.0 ELSE 0.0 END +
          CASE
            WHEN memory_entries.embedding IS NOT NULL THEN (1.0 - (memory_entries.embedding <=> ${vectorStr}::vector)) * 2.5
            ELSE 0.0
          END
        ) as rank
      FROM memory_entries
      JOIN namespaces ON memory_entries.namespace_id = namespaces.id
      WHERE ${scopeCondition}
        AND (
          memory_entries.search_vector @@ plainto_tsquery('english', ${cleanQuery})
          OR memory_entries.value_text % ${cleanQuery}
          OR memory_entries.key ILIKE '%' || ${cleanQuery} || '%'
          OR (memory_entries.embedding IS NOT NULL AND (memory_entries.embedding <=> ${vectorStr}::vector) <= 0.45)
        )
      ORDER BY rank DESC, memory_entries.pinned DESC, memory_entries.updated_at DESC
      LIMIT ${limit}
    `);

    return ((rows.rows as any[]) || []).map(mapRow);
  }

  // Pure keyword + trigram search when embeddings are disabled
  const rows = await db.execute(sql`
    SELECT
      memory_entries.id,
      memory_entries.namespace_id,
      namespaces.name as namespace_name,
      namespaces.path::text as namespace_path,
      memory_entries.key,
      memory_entries.value,
      memory_entries.value_text,
      memory_entries.pinned,
      memory_entries.version,
      (
        ts_rank(
          memory_entries.search_vector,
          plainto_tsquery('english', ${cleanQuery})
        ) * 2.0 +
        similarity(memory_entries.value_text, ${cleanQuery}) +
        CASE WHEN memory_entries.key ILIKE '%' || ${cleanQuery} || '%' THEN 1.0 ELSE 0.0 END
      ) as rank
    FROM memory_entries
    JOIN namespaces ON memory_entries.namespace_id = namespaces.id
    WHERE ${scopeCondition}
      AND (
        memory_entries.search_vector @@ plainto_tsquery('english', ${cleanQuery})
        OR memory_entries.value_text % ${cleanQuery}
        OR memory_entries.key ILIKE '%' || ${cleanQuery} || '%'
      )
    ORDER BY rank DESC, memory_entries.pinned DESC, memory_entries.updated_at DESC
    LIMIT ${limit}
  `);

  return ((rows.rows as any[]) || []).map(mapRow);
}

function mapRow(r: any): SearchResult {
  return {
    id: r.id,
    namespaceId: r.namespace_id ?? r.namespaceId,
    namespaceName: r.namespace_name ?? r.namespaceName,
    namespacePath: r.namespace_path ?? r.namespacePath,
    key: r.key,
    value: r.value,
    valueText: r.value_text ?? r.valueText ?? "",
    pinned: Boolean(r.pinned),
    version: Number(r.version),
    rank: Number(r.rank ?? 0),
  };
}
