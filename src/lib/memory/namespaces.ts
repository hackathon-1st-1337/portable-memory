import "server-only";
import { eq, and, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/client";
import {
  namespaces,
  agentScopes,
  agents,
  memoryEntries,
  type Namespace,
  type NewNamespace,
} from "@/db/schema";
import { sanitizeNamespaceName } from "./sanitize";

export interface NamespaceWithCounts extends Namespace {
  entryCount: number;
  agentCount: number;
}

/** Format UUID into a valid ltree label: n_<uuid with underscores> */
export function idToLtreeLabel(id: string): string {
  return `n_${id.replace(/-/g, "_")}`;
}

/**
 * List all active namespaces for a pod with entry and agent counts.
 */
export async function listNamespaces(
  podId: string
): Promise<NamespaceWithCounts[]> {
  const allNamespaces = await db
    .select()
    .from(namespaces)
    .where(and(eq(namespaces.podId, podId), isNull(namespaces.deletedAt)))
    .orderBy(namespaces.depth, namespaces.name);

  // Get entry counts per namespace
  const entryCountRows = await db
    .select({
      namespaceId: memoryEntries.namespaceId,
      count: sql<number>`count(*)::int`,
    })
    .from(memoryEntries)
    .where(and(eq(memoryEntries.podId, podId), isNull(memoryEntries.deletedAt)))
    .groupBy(memoryEntries.namespaceId);

  const entryCountMap = new Map<string, number>(
    entryCountRows.map((r) => [r.namespaceId, r.count])
  );

  // Get agent count per namespace (direct grants)
  const agentCountRows = await db
    .select({
      namespaceId: agentScopes.namespaceId,
      count: sql<number>`count(*)::int`,
    })
    .from(agentScopes)
    .groupBy(agentScopes.namespaceId);

  const agentCountMap = new Map<string, number>(
    agentCountRows.map((r) => [r.namespaceId, r.count])
  );

  return allNamespaces.map((ns) => ({
    ...ns,
    entryCount: entryCountMap.get(ns.id) ?? 0,
    agentCount: agentCountMap.get(ns.id) ?? 0,
  }));
}

/** Get namespace by ID */
export async function getNamespaceById(
  podId: string,
  id: string
): Promise<Namespace | null> {
  const rows = await db
    .select()
    .from(namespaces)
    .where(
      and(
        eq(namespaces.podId, podId),
        eq(namespaces.id, id),
        isNull(namespaces.deletedAt)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Resolves a human-readable folder path string (e.g. "projects/garden" or "identity")
 * to a namespace within the given pod.
 */
export async function resolveNamespaceByPath(
  podId: string,
  pathString: string
): Promise<Namespace | null> {
  const cleanPath = pathString.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!cleanPath) return null;

  const parts = cleanPath.split("/").map(sanitizeNamespaceName);
  if (parts.length > 3) return null;

  let currentParentId: string | null = null;
  let currentNamespace: Namespace | null = null;

  for (const part of parts) {
    const parentCondition = currentParentId
      ? eq(namespaces.parentId, currentParentId)
      : isNull(namespaces.parentId);

    const rows: Namespace[] = await db
      .select()
      .from(namespaces)
      .where(
        and(
          eq(namespaces.podId, podId),
          parentCondition,
          eq(namespaces.name, part),
          isNull(namespaces.deletedAt)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const found: Namespace = rows[0];
    currentNamespace = found;
    currentParentId = found.id;
  }

  return currentNamespace;
}

/**
 * Builds the human-readable path string for a namespace (e.g. "projects/garden").
 */
export async function getNamespacePathString(
  podId: string,
  namespaceId: string
): Promise<string> {
  const allNamespaces = await db
    .select()
    .from(namespaces)
    .where(and(eq(namespaces.podId, podId), isNull(namespaces.deletedAt)));

  const map = new Map(allNamespaces.map((ns) => [ns.id, ns]));
  const segments: string[] = [];
  let curr = map.get(namespaceId);

  while (curr) {
    segments.unshift(curr.name);
    curr = curr.parentId ? map.get(curr.parentId) : undefined;
  }

  return segments.join("/");
}

/**
 * Create a new namespace in a pod.
 * Maximum 3 levels of depth.
 */
export async function createNamespace(
  podId: string,
  data: {
    name: string;
    parentId?: string | null;
    description?: string;
    defaultVisibility?: "private" | "shared" | "public";
    agentsCanCreate?: boolean;
    grantAgentIds?: string[];
  }
): Promise<Namespace> {
  const name = sanitizeNamespaceName(data.name);
  const id = randomUUID();
  const label = idToLtreeLabel(id);

  let depth = 1;
  let path = label;

  if (data.parentId) {
    const parent = await getNamespaceById(podId, data.parentId);
    if (!parent) {
      throw new Error("Parent folder does not exist");
    }
    if (parent.depth >= 3) {
      throw new Error("Maximum folder depth is 3 levels");
    }
    depth = parent.depth + 1;
    path = `${parent.path}.${label}`;
  }

  // Check unique name under same parent
  const existing = await db
    .select()
    .from(namespaces)
    .where(
      data.parentId
        ? and(
            eq(namespaces.podId, podId),
            eq(namespaces.parentId, data.parentId),
            eq(namespaces.name, name),
            isNull(namespaces.deletedAt)
          )
        : and(
            eq(namespaces.podId, podId),
            isNull(namespaces.parentId),
            eq(namespaces.name, name),
            isNull(namespaces.deletedAt)
          )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`A folder named '${name}' already exists in this location`);
  }

  const [created] = await db
    .insert(namespaces)
    .values({
      id,
      podId,
      parentId: data.parentId || null,
      name,
      path,
      depth,
      description: data.description?.trim() || null,
      defaultVisibility: data.defaultVisibility || "shared",
      agentsCanCreate: data.agentsCanCreate ?? true,
    })
    .returning();

  // If initial agent grants were specified
  if (data.grantAgentIds && data.grantAgentIds.length > 0) {
    for (const agentId of data.grantAgentIds) {
      await db
        .insert(agentScopes)
        .values({ agentId, namespaceId: created.id })
        .onConflictDoNothing();
    }
  }

  return created;
}

/**
 * Rename and/or update settings of a namespace.
 * Renaming does NOT modify the ltree path since paths use IDs.
 */
export async function updateNamespace(
  podId: string,
  id: string,
  data: {
    name?: string;
    description?: string;
    defaultVisibility?: "private" | "shared" | "public";
    agentsCanCreate?: boolean;
    requireApproval?: boolean;
  }
): Promise<Namespace> {
  const existing = await getNamespaceById(podId, id);
  if (!existing) throw new Error("Folder not found");

  const updates: Partial<typeof namespaces.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    const newName = sanitizeNamespaceName(data.name);
    if (newName !== existing.name) {
      // Check collision
      const collision = await db
        .select()
        .from(namespaces)
        .where(
          existing.parentId
            ? and(
                eq(namespaces.podId, podId),
                eq(namespaces.parentId, existing.parentId),
                eq(namespaces.name, newName),
                isNull(namespaces.deletedAt)
              )
            : and(
                eq(namespaces.podId, podId),
                isNull(namespaces.parentId),
                eq(namespaces.name, newName),
                isNull(namespaces.deletedAt)
              )
        )
        .limit(1);

      if (collision.length > 0) {
        throw new Error(`A folder named '${newName}' already exists here`);
      }
      updates.name = newName;
    }
  }

  if (data.description !== undefined) {
    updates.description = data.description.trim() || null;
  }

  if (data.defaultVisibility !== undefined) {
    updates.defaultVisibility = data.defaultVisibility;
  }

  if (data.agentsCanCreate !== undefined) {
    updates.agentsCanCreate = data.agentsCanCreate;
  }

  if (data.requireApproval !== undefined) {
    updates.requireApproval = data.requireApproval;
  }

  const [updated] = await db
    .update(namespaces)
    .set(updates)
    .where(eq(namespaces.id, id))
    .returning();

  return updated;
}

/**
 * Move a namespace under a new parent.
 * Validates depth constraint (max 3 levels total for subtree).
 * Updates ltree path for the namespace and all descendants.
 */
export async function moveNamespace(
  podId: string,
  id: string,
  newParentId: string | null
): Promise<Namespace> {
  const current = await getNamespaceById(podId, id);
  if (!current) throw new Error("Folder not found");

  if (current.parentId === newParentId) {
    return current; // No move needed
  }

  // Prevent moving into itself or its own descendants
  if (newParentId) {
    const targetParent = await getNamespaceById(podId, newParentId);
    if (!targetParent) throw new Error("Target folder not found");

    if (
      targetParent.path === current.path ||
      targetParent.path.startsWith(`${current.path}.`)
    ) {
      throw new Error("Cannot move a folder into itself or its subfolder");
    }

    // Get max subtree depth below current
    const descendants = await db
      .select({ depth: namespaces.depth })
      .from(namespaces)
      .where(
        and(
          eq(namespaces.podId, podId),
          sql`path <@ ${current.path}::ltree`,
          isNull(namespaces.deletedAt)
        )
      );

    const maxRelativeDepth = Math.max(...descendants.map((d) => d.depth - current.depth), 0);
    const newDepth = targetParent.depth + 1;
    if (newDepth + maxRelativeDepth > 3) {
      throw new Error(
        `Moving this folder here would exceed the maximum depth limit of 3 levels (resulting depth: ${
          newDepth + maxRelativeDepth
        })`
      );
    }
  }

  let newPath = idToLtreeLabel(current.id);
  let newDepth = 1;

  if (newParentId) {
    const parent = await getNamespaceById(podId, newParentId);
    if (!parent) throw new Error("Target parent not found");
    newDepth = parent.depth + 1;
    newPath = `${parent.path}.${idToLtreeLabel(current.id)}`;
  }

  const oldPath = current.path;
  const depthDiff = newDepth - current.depth;

  // Update current and all descendants in transaction
  const [updated] = await db
    .update(namespaces)
    .set({
      parentId: newParentId,
      path: newPath,
      depth: newDepth,
      updatedAt: new Date(),
    })
    .where(eq(namespaces.id, id))
    .returning();

  // Update all descendants' paths and depths using ltree rewrite
  if (oldPath !== newPath) {
    await db.execute(sql`
      UPDATE namespaces
      SET path = ${newPath}::ltree || subpath(path, nlevel(${oldPath}::ltree)),
          depth = depth + ${depthDiff},
          updated_at = NOW()
      WHERE pod_id = ${podId}
        AND path <@ ${oldPath}::ltree
        AND id <> ${id}
    `);
  }

  return updated;
}

/**
 * Soft delete a namespace.
 */
export async function softDeleteNamespace(
  podId: string,
  id: string,
  moveEntriesToNamespaceId?: string | null
): Promise<void> {
  const current = await getNamespaceById(podId, id);
  if (!current) throw new Error("Folder not found");

  if (moveEntriesToNamespaceId) {
    const target = await getNamespaceById(podId, moveEntriesToNamespaceId);
    if (!target) throw new Error("Target destination folder not found");

    // Move entries first
    await db
      .update(memoryEntries)
      .set({ namespaceId: target.id, updatedAt: new Date() })
      .where(
        and(
          eq(memoryEntries.namespaceId, id),
          isNull(memoryEntries.deletedAt)
        )
      );
  } else {
    // Soft-delete entries inside this namespace
    await db
      .update(memoryEntries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(memoryEntries.namespaceId, id),
          isNull(memoryEntries.deletedAt)
        )
      );
  }

  // Soft-delete the namespace and its descendants
  await db.execute(sql`
    UPDATE namespaces
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE pod_id = ${podId}
      AND (path <@ ${current.path}::ltree OR id = ${id})
      AND deleted_at IS NULL
  `);

  // Remove any agent scopes directly on this namespace
  await db.delete(agentScopes).where(eq(agentScopes.namespaceId, id));
}

/**
 * Return agents that have direct or inherited access to this namespace.
 */
export async function getAgentsCoveringNamespace(
  podId: string,
  namespaceId: string
): Promise<{ id: string; name: string; platform: string }[]> {
  const current = await getNamespaceById(podId, namespaceId);
  if (!current) return [];

  const result = await db.execute(sql`
    SELECT DISTINCT a.id, a.name, a.platform
    FROM agents a
    LEFT JOIN agent_scopes s ON a.id = s.agent_id
    LEFT JOIN namespaces granted_ns ON s.namespace_id = granted_ns.id
    WHERE a.pod_id = ${podId}
      AND a.status = 'active'
      AND (
        a.all_namespaces = true
        OR (${current.path}::ltree <@ granted_ns.path)
      )
  `);

  return (result.rows as unknown as { id: string; name: string; platform: string }[]) || [];
}
