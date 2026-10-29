import "server-only";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/client";
import {
  memoryEntries,
  memoryEntryVersions,
  namespaces,
  agents,
  pods,
  type MemoryEntry,
  type MemoryEntryVersion,
} from "@/db/schema";
import { sanitizeKey, sanitizeValue } from "./sanitize";
import { logAuditEvent } from "./audit";
import { generateEmbedding, findNearDuplicate } from "./embeddings";

export interface CreateEntryParams {
  podId: string;
  namespaceId: string;
  key: string;
  value: unknown;
  visibility?: "private" | "shared" | "public";
  pinned?: boolean;
  kind?: "fact" | "event" | "procedure";
  status?: "live" | "draft" | "rejected";
  procedureWhen?: string | null;
  createdByUser: boolean;
  sourceAgentId?: string | null;
  tokenId?: string | null;
}

export interface UpdateEntryParams {
  podId: string;
  entryId: string;
  value?: unknown;
  visibility?: "private" | "shared" | "public";
  pinned?: boolean;
  kind?: "fact" | "event" | "procedure";
  status?: "live" | "draft" | "rejected";
  procedureWhen?: string | null;
  expectedVersion?: number;
  changedByUser: boolean;
  sourceAgentId?: string | null;
  tokenId?: string | null;
}

export interface EntryWithNamespace extends MemoryEntry {
  namespaceName: string;
  namespacePath: string;
  sourceAgentName?: string | null;
}

/**
 * List entries in a pod with optional namespace or pinned filtering.
 */
export async function listEntries(
  podId: string,
  options: {
    namespaceId?: string;
    pinnedOnly?: boolean;
    includePrivate?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<EntryWithNamespace[]> {
  const conditions = [
    eq(memoryEntries.podId, podId),
    isNull(memoryEntries.deletedAt),
    isNull(namespaces.deletedAt),
  ];

  if (options.namespaceId) {
    conditions.push(eq(memoryEntries.namespaceId, options.namespaceId));
  }
  if (options.pinnedOnly) {
    conditions.push(eq(memoryEntries.pinned, true));
  }
  if (!options.includePrivate) {
    conditions.push(sql`${memoryEntries.visibility} <> 'private'`);
  }

  const limit = Math.min(options.limit ?? 100, 500);
  const offset = options.offset ?? 0;

  const rows = await db
    .select({
      entry: memoryEntries,
      nsName: namespaces.name,
      nsPath: namespaces.path,
      agentName: agents.name,
    })
    .from(memoryEntries)
    .innerJoin(namespaces, eq(memoryEntries.namespaceId, namespaces.id))
    .leftJoin(agents, eq(memoryEntries.sourceAgentId, agents.id))
    .where(and(...conditions))
    .orderBy(desc(memoryEntries.pinned), desc(memoryEntries.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r.entry,
    namespaceName: r.nsName,
    namespacePath: r.nsPath,
    sourceAgentName: r.agentName ?? null,
  }));
}

/**
 * Get an entry by namespace ID and key.
 */
export async function getEntryByKey(
  podId: string,
  namespaceId: string,
  key: string
): Promise<MemoryEntry | null> {
  const cleanKey = sanitizeKey(key);
  const rows = await db
    .select()
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.podId, podId),
        eq(memoryEntries.namespaceId, namespaceId),
        eq(memoryEntries.key, cleanKey),
        isNull(memoryEntries.deletedAt)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Get an entry by ID.
 */
export async function getEntryById(
  podId: string,
  entryId: string
): Promise<EntryWithNamespace | null> {
  const rows = await db
    .select({
      entry: memoryEntries,
      nsName: namespaces.name,
      nsPath: namespaces.path,
      agentName: agents.name,
    })
    .from(memoryEntries)
    .innerJoin(namespaces, eq(memoryEntries.namespaceId, namespaces.id))
    .leftJoin(agents, eq(memoryEntries.sourceAgentId, agents.id))
    .where(
      and(
        eq(memoryEntries.podId, podId),
        eq(memoryEntries.id, entryId),
        isNull(memoryEntries.deletedAt)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  return {
    ...rows[0].entry,
    namespaceName: rows[0].nsName,
    namespacePath: rows[0].nsPath,
    sourceAgentName: rows[0].agentName ?? null,
  };
}

/**
 * Create a new memory entry.
 * Records version 1 in history and writes an audit event.
 */
export async function createEntry(
  params: CreateEntryParams
): Promise<MemoryEntry> {
  const key = sanitizeKey(params.key);
  const { value, valueText } = sanitizeValue(params.value);

  const ns = await db
    .select()
    .from(namespaces)
    .where(
      and(
        eq(namespaces.id, params.namespaceId),
        eq(namespaces.podId, params.podId),
        isNull(namespaces.deletedAt)
      )
    )
    .limit(1);

  if (ns.length === 0) {
    throw new Error("Folder not found");
  }

  // Check agentsCanCreate restriction
  if (!params.createdByUser && !ns[0].agentsCanCreate) {
    throw new Error(
      "This folder does not allow agents to create new keys. Only updating existing keys is allowed."
    );
  }

  // Check if active key already exists
  const existing = await getEntryByKey(params.podId, params.namespaceId, key);
  if (existing) {
    throw new Error(`An entry with key '${key}' already exists in this folder`);
  }

  // Check if pod allows embeddings
  const podRow = await db
    .select({ allowEmbeddings: pods.allowEmbeddings })
    .from(pods)
    .where(eq(pods.id, params.podId))
    .limit(1);

  const allowEmbeddings = podRow[0]?.allowEmbeddings ?? false;
  let embeddingVector: number[] | null = null;
  let embeddingModelName: string | null = null;

  if (allowEmbeddings) {
    const { embedding, model } = await generateEmbedding(valueText);
    embeddingVector = embedding;
    embeddingModelName = model;

    // Near-duplicate check for agent writes: return existing instead of duplicating
    if (!params.createdByUser) {
      const nearDuplicate = await findNearDuplicate(
        params.podId,
        params.namespaceId,
        embeddingVector
      );
      if (nearDuplicate) {
        return nearDuplicate;
      }
    }
  }

  const visibility =
    params.visibility ??
    (ns[0].defaultVisibility as "private" | "shared" | "public");

  const initialStatus =
    params.status ??
    (!params.createdByUser && ns[0].requireApproval ? "draft" : "live");
  const kind = params.kind ?? "fact";
  const procedureWhen = params.procedureWhen ?? null;

  const [entry] = await db
    .insert(memoryEntries)
    .values({
      podId: params.podId,
      namespaceId: params.namespaceId,
      key,
      value,
      valueText,
      visibility,
      pinned: params.pinned ?? false,
      kind,
      status: initialStatus,
      procedureWhen,
      version: 1,
      createdByUser: params.createdByUser,
      sourceAgentId: params.sourceAgentId || null,
      embedding: embeddingVector || undefined,
      embeddingModel: embeddingModelName || undefined,
    })
    .returning();

  // Record version 1
  await db.insert(memoryEntryVersions).values({
    entryId: entry.id,
    version: 1,
    value,
    valueText,
    changedByUser: params.createdByUser,
    sourceAgentId: params.sourceAgentId || null,
    change: "create",
  });

  // Log audit
  await logAuditEvent({
    podId: params.podId,
    actorType: params.createdByUser ? "user" : "agent",
    agentId: params.sourceAgentId,
    tokenId: params.tokenId,
    action: "write",
    namespaceId: params.namespaceId,
    key,
    outcome: "ok",
    detail: { version: 1, pinned: entry.pinned, visibility: entry.visibility },
  });

  return entry;
}

/**
 * Update an existing entry.
 * Supports optimistic concurrency via expectedVersion.
 * Automatically archives previous version in memory_entry_versions.
 */
export async function updateEntry(
  params: UpdateEntryParams
): Promise<MemoryEntry> {
  const current = await getEntryById(params.podId, params.entryId);
  if (!current) {
    throw new Error("Entry not found");
  }

  if (
    params.expectedVersion !== undefined &&
    current.version !== params.expectedVersion
  ) {
    throw new Error(
      `Conflict: Expected version ${params.expectedVersion}, but entry is at version ${current.version}`
    );
  }

  const newVersion = current.version + 1;
  const updates: Partial<typeof memoryEntries.$inferInsert> = {
    version: newVersion,
    updatedAt: new Date(),
  };

  let valueToStore = current.value;
  let textToStore = current.valueText;

  if (params.value !== undefined) {
    const sanitized = sanitizeValue(params.value);
    valueToStore = sanitized.value;
    textToStore = sanitized.valueText;
    updates.value = valueToStore;
    updates.valueText = textToStore;

    // Check if pod allows embeddings
    const podRow = await db
      .select({ allowEmbeddings: pods.allowEmbeddings })
      .from(pods)
      .where(eq(pods.id, params.podId))
      .limit(1);

    if (podRow[0]?.allowEmbeddings) {
      const { embedding, model } = await generateEmbedding(textToStore);
      updates.embedding = embedding;
      updates.embeddingModel = model;
    }
  }

  if (params.visibility !== undefined) {
    updates.visibility = params.visibility;
  }

  if (params.pinned !== undefined) {
    updates.pinned = params.pinned;
  }

  if (params.kind !== undefined) {
    updates.kind = params.kind;
  }

  if (params.status !== undefined) {
    updates.status = params.status;
  }

  if (params.procedureWhen !== undefined) {
    updates.procedureWhen = params.procedureWhen;
  }

  if (!params.changedByUser && params.sourceAgentId) {
    updates.sourceAgentId = params.sourceAgentId;
    const nsRows = await db
      .select({ requireApproval: namespaces.requireApproval })
      .from(namespaces)
      .where(eq(namespaces.id, current.namespaceId))
      .limit(1);
    if (nsRows[0]?.requireApproval) {
      updates.status = "draft";
    }
  }

  const [updated] = await db
    .update(memoryEntries)
    .set(updates)
    .where(eq(memoryEntries.id, current.id))
    .returning();

  // Save version snapshot
  await db.insert(memoryEntryVersions).values({
    entryId: current.id,
    version: newVersion,
    value: valueToStore,
    valueText: textToStore,
    changedByUser: params.changedByUser,
    sourceAgentId: params.sourceAgentId || null,
    change: "update",
  });

  // Log audit
  await logAuditEvent({
    podId: params.podId,
    actorType: params.changedByUser ? "user" : "agent",
    agentId: params.sourceAgentId,
    tokenId: params.tokenId,
    action: "write",
    namespaceId: current.namespaceId,
    key: current.key,
    outcome: "ok",
    detail: { version: newVersion, previousVersion: current.version },
  });

  return updated;
}

/**
 * Soft delete an entry and log the audit event.
 */
export async function deleteEntry(
  podId: string,
  entryId: string,
  actor: {
    actorType: "user" | "agent";
    agentId?: string | null;
    tokenId?: string | null;
  }
): Promise<void> {
  const current = await getEntryById(podId, entryId);
  if (!current) {
    throw new Error("Entry not found");
  }

  const [deleted] = await db
    .update(memoryEntries)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(memoryEntries.id, entryId))
    .returning();

  // Record deletion version
  await db.insert(memoryEntryVersions).values({
    entryId: current.id,
    version: current.version + 1,
    value: current.value,
    valueText: current.valueText,
    changedByUser: actor.actorType === "user",
    sourceAgentId: actor.agentId || null,
    change: "delete",
  });

  // Log audit
  await logAuditEvent({
    podId,
    actorType: actor.actorType,
    agentId: actor.agentId,
    tokenId: actor.tokenId,
    action: "delete",
    namespaceId: current.namespaceId,
    key: current.key,
    outcome: "ok",
    detail: { deletedVersion: current.version },
  });
}

/**
 * Get full version history for an entry.
 */
export async function getEntryVersions(
  podId: string,
  entryId: string
): Promise<MemoryEntryVersion[]> {
  // Verify entry belongs to pod
  const entry = await db
    .select({ id: memoryEntries.id })
    .from(memoryEntries)
    .where(and(eq(memoryEntries.id, entryId), eq(memoryEntries.podId, podId)))
    .limit(1);

  if (entry.length === 0) return [];

  return db
    .select()
    .from(memoryEntryVersions)
    .where(eq(memoryEntryVersions.entryId, entryId))
    .orderBy(desc(memoryEntryVersions.version));
}

/**
 * Restore an entry to a previous version.
 */
export async function restoreEntryVersion(
  podId: string,
  entryId: string,
  targetVersion: number,
  userId: string
): Promise<MemoryEntry> {
  const current = await getEntryById(podId, entryId);
  if (!current) throw new Error("Entry not found");

  const versions = await db
    .select()
    .from(memoryEntryVersions)
    .where(
      and(
        eq(memoryEntryVersions.entryId, entryId),
        eq(memoryEntryVersions.version, targetVersion)
      )
    )
    .limit(1);

  if (versions.length === 0) {
    throw new Error(`Version ${targetVersion} not found`);
  }

  const target = versions[0];
  const newVersion = current.version + 1;

  const [restored] = await db
    .update(memoryEntries)
    .set({
      value: target.value,
      valueText: target.valueText,
      version: newVersion,
      deletedAt: null, // Un-delete if it was deleted
      updatedAt: new Date(),
    })
    .where(eq(memoryEntries.id, entryId))
    .returning();

  await db.insert(memoryEntryVersions).values({
    entryId,
    version: newVersion,
    value: target.value,
    valueText: target.valueText,
    changedByUser: true,
    sourceAgentId: null,
    change: "restore",
  });

  await logAuditEvent({
    podId,
    actorType: "user",
    action: "write",
    namespaceId: current.namespaceId,
    key: current.key,
    outcome: "ok",
    detail: { restoredFromVersion: targetVersion, newVersion },
  });

  return restored;
}
