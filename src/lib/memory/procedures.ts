import "server-only";

import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  memoryEntries,
  namespaces,
  type MemoryEntry,
} from "@/db/schema";
import { logAuditEvent } from "./audit";
import { createEntry, updateEntry } from "./entries";
import { sanitizeKey } from "./sanitize";

export interface PendingDraftItem {
  id: string;
  namespaceId: string;
  namespaceName: string;
  namespacePath: string;
  key: string;
  value: unknown;
  valueText: string;
  kind: string;
  procedureWhen: string | null;
  version: number;
  sourceAgentId: string | null;
  updatedAt: Date;
}

/**
 * List all entries in a pod awaiting user approval (status = 'draft').
 */
export async function listPendingDrafts(
  podId: string
): Promise<PendingDraftItem[]> {
  const rows = await db
    .select({
      id: memoryEntries.id,
      namespaceId: memoryEntries.namespaceId,
      namespaceName: namespaces.name,
      namespacePath: namespaces.path,
      key: memoryEntries.key,
      value: memoryEntries.value,
      valueText: memoryEntries.valueText,
      kind: memoryEntries.kind,
      procedureWhen: memoryEntries.procedureWhen,
      version: memoryEntries.version,
      sourceAgentId: memoryEntries.sourceAgentId,
      updatedAt: memoryEntries.updatedAt,
    })
    .from(memoryEntries)
    .innerJoin(namespaces, eq(memoryEntries.namespaceId, namespaces.id))
    .where(
      and(
        eq(memoryEntries.podId, podId),
        eq(memoryEntries.status, "draft"),
        sql`${memoryEntries.deletedAt} IS NULL`
      )
    )
    .orderBy(desc(memoryEntries.updatedAt));

  return rows.map((r) => ({
    ...r,
    namespacePath: String(r.namespacePath),
  }));
}

/**
 * Approve a draft entry: promotes status from 'draft' to 'live'.
 */
export async function approveDraft(
  podId: string,
  entryId: string,
  userId?: string
): Promise<MemoryEntry> {
  const [existing] = await db
    .select()
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.id, entryId),
        eq(memoryEntries.podId, podId),
        sql`${memoryEntries.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error(`Draft entry not found: ${entryId}`);
  }

  const [updated] = await db
    .update(memoryEntries)
    .set({
      status: "live",
      updatedAt: new Date(),
    })
    .where(eq(memoryEntries.id, entryId))
    .returning();

  await logAuditEvent({
    podId,
    actorType: "user",
    action: "draft.approve",
    namespaceId: existing.namespaceId,
    key: existing.key,
    outcome: "ok",
    detail: { entryId, version: existing.version, approvedBy: userId },
  });

  return updated;
}

/**
 * Reject a draft entry: sets status to 'rejected' or soft-deletes it.
 */
export async function rejectDraft(
  podId: string,
  entryId: string,
  userId?: string
): Promise<MemoryEntry> {
  const [existing] = await db
    .select()
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.id, entryId),
        eq(memoryEntries.podId, podId),
        sql`${memoryEntries.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error(`Draft entry not found: ${entryId}`);
  }

  const [updated] = await db
    .update(memoryEntries)
    .set({
      status: "rejected",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(memoryEntries.id, entryId))
    .returning();

  await logAuditEvent({
    podId,
    actorType: "user",
    action: "draft.reject",
    namespaceId: existing.namespaceId,
    key: existing.key,
    outcome: "ok",
    detail: { entryId, version: existing.version, rejectedBy: userId },
  });

  return updated;
}

/**
 * Create or save a procedure entry.
 */
export async function saveProcedure(
  podId: string,
  namespaceId: string,
  input: {
    key: string;
    procedureWhen: string;
    value: unknown;
    pinned?: boolean;
    createdByUser?: boolean;
    sourceAgentId?: string;
  }
): Promise<MemoryEntry> {
  const cleanKey = sanitizeKey(input.key);

  const [existing] = await db
    .select()
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.podId, podId),
        eq(memoryEntries.namespaceId, namespaceId),
        eq(memoryEntries.key, cleanKey),
        sql`${memoryEntries.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (existing) {
    const updated = await updateEntry({
      podId,
      entryId: existing.id,
      value: input.value,
      pinned: input.pinned,
      kind: "procedure",
      procedureWhen: input.procedureWhen,
      changedByUser: input.createdByUser ?? true,
      sourceAgentId: input.sourceAgentId,
    });
    return updated;
  }

  return createEntry({
    podId,
    namespaceId,
    key: cleanKey,
    value: input.value,
    kind: "procedure",
    procedureWhen: input.procedureWhen,
    pinned: input.pinned ?? false,
    createdByUser: input.createdByUser ?? true,
    sourceAgentId: input.sourceAgentId,
  });
}

/**
 * List live procedures in a pod (or namespace).
 */
export async function listLiveProcedures(
  podId: string,
  namespaceId?: string
): Promise<MemoryEntry[]> {
  const conditions = [
    eq(memoryEntries.podId, podId),
    eq(memoryEntries.kind, "procedure"),
    eq(memoryEntries.status, "live"),
    sql`${memoryEntries.deletedAt} IS NULL`,
  ];

  if (namespaceId) {
    conditions.push(eq(memoryEntries.namespaceId, namespaceId));
  }

  return db
    .select()
    .from(memoryEntries)
    .where(and(...conditions))
    .orderBy(desc(memoryEntries.pinned), desc(memoryEntries.updatedAt));
}
