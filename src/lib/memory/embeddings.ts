import "server-only";
import { createHash } from "crypto";
import { sql, eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memoryEntries, type MemoryEntry } from "@/db/schema";
import { runCloudflareEmbedding } from "@/lib/ai/cloudflare";

export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.92;

/**
 * Generates a normalized 1536-dimensional vector embedding for text.
 * Priority order:
 * 1. Cloudflare Workers AI (@cf/baai/bge-m3) if CLOUDFLARE_API_TOKEN is set
 * 2. OpenAI (text-embedding-3-small) if OPENAI_API_KEY is set
 * 3. Local deterministic feature projection (zero-dependency fallback)
 */
export async function generateEmbedding(
  text: string
): Promise<{ embedding: number[]; model: string }> {
  const clean = text.trim();
  if (!clean) {
    return {
      embedding: new Array(EMBEDDING_DIMENSIONS).fill(0),
      model: "local-feature-projection-1536",
    };
  }

  // 1. Cloudflare Workers AI (@cf/baai/bge-m3)
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    const cf = await runCloudflareEmbedding(clean);
    if (cf && cf.embedding.length > 0) {
      // Pad 1024-dimension vector to 1536 dimensions
      // Mathematically, padding with zeros preserves cosine similarity and ranking identically.
      const padded = new Array(EMBEDDING_DIMENSIONS).fill(0);
      for (let i = 0; i < cf.embedding.length; i++) {
        padded[i] = cf.embedding[i];
      }
      return {
        embedding: padded,
        model: `cloudflare:${cf.model}`,
      };
    }
  }

  // If OPENAI_API_KEY is provided, try OpenAI embedding
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: clean,
          model: "text-embedding-3-small",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          embedding: data.data[0].embedding,
          model: "text-embedding-3-small",
        };
      }
    } catch {
      // Fallback to local deterministic projection
    }
  }

  // Deterministic local feature projection to 1536 normalized dimensions
  return {
    embedding: computeLocalProjection(clean, EMBEDDING_DIMENSIONS),
    model: "local-projection-1536",
  };
}

/**
 * Computes a deterministic normalized unit vector using n-gram feature hashing.
 * Semantically similar texts with overlapping words produce high cosine similarities.
 */
function computeLocalProjection(text: string, dims: number): number[] {
  const vec = new Float64Array(dims);
  const words = text.toLowerCase().match(/\w+/g) || [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Hash unigrams
    hashIntoVector(word, vec, dims, 1.0);

    // Hash bigrams for contextual similarity
    if (i + 1 < words.length) {
      hashIntoVector(`${word}_${words[i + 1]}`, vec, dims, 1.5);
    }
  }

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);

  const result: number[] = new Array(dims);
  if (norm > 0) {
    for (let i = 0; i < dims; i++) result[i] = Number((vec[i] / norm).toFixed(6));
  } else {
    result.fill(0);
  }

  return result;
}

function hashIntoVector(
  token: string,
  vec: Float64Array,
  dims: number,
  weight: number
) {
  const hash = createHash("sha256").update(token).digest();
  // Use pairs of bytes for index and sign
  for (let b = 0; b < 16; b += 2) {
    const index = (hash[b] * 256 + hash[b + 1]) % dims;
    const sign = (hash[b] & 1) === 0 ? 1 : -1;
    vec[index] += sign * weight;
  }
}

/**
 * Checks for near-duplicate memory entries in a folder using cosine similarity.
 * Returns the existing entry if cosine similarity >= threshold.
 */
export async function findNearDuplicate(
  podId: string,
  namespaceId: string,
  embedding: number[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD
): Promise<MemoryEntry | null> {
  const vectorStr = `[${embedding.join(",")}]`;

  // Cosine distance in pgvector: <=> where cosine similarity = 1 - distance
  const maxDistance = 1.0 - threshold;

  const rows = await db.execute(sql`
    SELECT
      id,
      key,
      value,
      value_text,
      version,
      (1.0 - (embedding <=> ${vectorStr}::vector)) as similarity
    FROM memory_entries
    WHERE pod_id = ${podId}
      AND namespace_id = ${namespaceId}
      AND deleted_at IS NULL
      AND embedding IS NOT NULL
      AND (embedding <=> ${vectorStr}::vector) <= ${maxDistance}
    ORDER BY embedding <=> ${vectorStr}::vector ASC
    LIMIT 1
  `);

  if (!rows.rows || rows.rows.length === 0) {
    return null;
  }

  return rows.rows[0] as unknown as MemoryEntry;
}

/**
 * Backfills embeddings for entries in a pod that don't have embeddings yet.
 */
export async function backfillPodEmbeddings(podId: string): Promise<number> {
  const rows = await db
    .select({
      id: memoryEntries.id,
      valueText: memoryEntries.valueText,
    })
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.podId, podId),
        isNull(memoryEntries.deletedAt),
        isNull(memoryEntries.embedding)
      )
    );

  let updated = 0;
  for (const row of rows) {
    const { embedding, model } = await generateEmbedding(row.valueText);
    const vectorStr = `[${embedding.join(",")}]`;

    await db.execute(sql`
      UPDATE memory_entries
      SET embedding = ${vectorStr}::vector,
          embedding_model = ${model}
      WHERE id = ${row.id}
    `);
    updated++;
  }

  return updated;
}
