import { NextRequest, NextResponse } from "next/server";
import { authenticateAgentToken } from "@/lib/agents/authenticate";
import { hasPermission } from "@/lib/agents/permissions";
import {
  resolveNamespaceByPath,
  getNamespacePathString,
} from "@/lib/memory/namespaces";
import {
  isNamespaceAccessibleToAgent,
  buildAgentScopeFilter,
} from "@/lib/memory/scope";
import {
  getEntryByKey,
  createEntry,
  updateEntry,
  deleteEntry,
} from "@/lib/memory/entries";
import { logAuditEvent } from "@/lib/memory/audit";
import { db } from "@/db/client";
import { memoryEntries, namespaces } from "@/db/schema";
import { sql, eq, and, isNull } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

/**
 * GET /api/v1/memory/[...path]
 * Handles:
 * 1. /api/v1/memory/:namespace -> lists keys in that namespace
 * 2. /api/v1/memory/:namespace/:key -> reads a specific memory entry
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  const auth = await authenticateAgentToken(
    request.headers.get("Authorization")
  );

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { agent, token, pod } = auth.context;

  if (path.length === 0) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  // Case 1: Check if the entire path matches a namespace
  const fullPathStr = path.join("/");
  const nsAsWhole = await resolveNamespaceByPath(pod.id, fullPathStr);

  if (nsAsWhole) {
    // Check agent scope
    const accessible = await isNamespaceAccessibleToAgent(agent, nsAsWhole.id);
    if (!accessible) {
      await logAuditEvent({
        podId: pod.id,
        actorType: "agent",
        agentId: agent.id,
        tokenId: token.id,
        action: "list",
        namespaceId: nsAsWhole.id,
        namespacePath: fullPathStr,
        outcome: "denied",
        detail: { reason: "Out of granted scope" },
      });
      return NextResponse.json({ error: "Forbidden: Namespace is not in granted scope" }, { status: 403 });
    }

    // List keys in this namespace
    const canRead = hasPermission(agent.permissions, "memory:read");
    const canList = hasPermission(agent.permissions, "memory:list");

    if (!canRead && !canList) {
      return NextResponse.json(
        { error: "Forbidden: Requires memory:list or memory:read permission" },
        { status: 403 }
      );
    }

    const rows = await db
      .select({
        key: memoryEntries.key,
        value: canRead ? memoryEntries.value : sql`NULL`,
        version: memoryEntries.version,
        updatedAt: memoryEntries.updatedAt,
      })
      .from(memoryEntries)
      .where(
        and(
          eq(memoryEntries.podId, pod.id),
          eq(memoryEntries.namespaceId, nsAsWhole.id),
          isNull(memoryEntries.deletedAt),
          sql`${memoryEntries.visibility} <> 'private'`
        )
      )
      .orderBy(memoryEntries.key);

    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "list",
      namespaceId: nsAsWhole.id,
      namespacePath: fullPathStr,
      outcome: "ok",
      detail: { count: rows.length },
    });

    return NextResponse.json({
      namespace: fullPathStr,
      entries: rows.map((r) => ({
        key: r.key,
        ...(canRead ? { value: r.value } : {}),
        version: r.version,
        updated_at: r.updatedAt,
      })),
    });
  }

  // Case 2: Last segment is a key, prefix is the namespace path
  if (path.length >= 2) {
    const nsPath = path.slice(0, -1).join("/");
    const key = path[path.length - 1];

    const targetNs = await resolveNamespaceByPath(pod.id, nsPath);
    if (!targetNs) {
      return NextResponse.json({ error: "Namespace not found" }, { status: 404 });
    }

    const accessible = await isNamespaceAccessibleToAgent(agent, targetNs.id);
    if (!accessible) {
      await logAuditEvent({
        podId: pod.id,
        actorType: "agent",
        agentId: agent.id,
        tokenId: token.id,
        action: "read",
        namespaceId: targetNs.id,
        namespacePath: nsPath,
        key,
        outcome: "denied",
      });
      return NextResponse.json({ error: "Forbidden: Namespace is not in granted scope" }, { status: 403 });
    }

    if (!hasPermission(agent.permissions, "memory:read")) {
      return NextResponse.json(
        { error: "Forbidden: Requires memory:read permission" },
        { status: 403 }
      );
    }

    const entry = await getEntryByKey(pod.id, targetNs.id, key);
    if (!entry || entry.visibility === "private") {
      await logAuditEvent({
        podId: pod.id,
        actorType: "agent",
        agentId: agent.id,
        tokenId: token.id,
        action: "read",
        namespaceId: targetNs.id,
        namespacePath: nsPath,
        key,
        outcome: "not_found",
      });
      return NextResponse.json({ error: "Memory entry not found" }, { status: 404 });
    }

    // Update last_read_at
    db.update(memoryEntries)
      .set({ lastReadAt: new Date() })
      .where(eq(memoryEntries.id, entry.id))
      .catch(() => {});

    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "read",
      namespaceId: targetNs.id,
      namespacePath: nsPath,
      key,
      outcome: "ok",
    });

    return NextResponse.json({
      namespace: nsPath,
      key: entry.key,
      value: entry.value,
      pinned: entry.pinned,
      version: entry.version,
      updated_at: entry.updatedAt,
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * PUT /api/v1/memory/[...path]
 * Create or update a memory entry.
 * Body: { value: any, pinned?: boolean }
 * Supports If-Match version concurrency header (returns 409 Conflict if mismatched).
 * Enforces namespaces.agents_can_create constraint.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  const auth = await authenticateAgentToken(
    request.headers.get("Authorization"),
    "memory:write"
  );

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { agent, token, pod } = auth.context;

  if (path.length < 2) {
    return NextResponse.json(
      { error: "Invalid path. Expected /api/v1/memory/:namespace/:key" },
      { status: 400 }
    );
  }

  const nsPath = path.slice(0, -1).join("/");
  const key = path[path.length - 1];

  const targetNs = await resolveNamespaceByPath(pod.id, nsPath);
  if (!targetNs) {
    return NextResponse.json({ error: `Folder '${nsPath}' not found` }, { status: 404 });
  }

  const accessible = await isNamespaceAccessibleToAgent(agent, targetNs.id);
  if (!accessible) {
    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "write",
      namespaceId: targetNs.id,
      namespacePath: nsPath,
      key,
      outcome: "denied",
      detail: { reason: "Folder not in agent's granted scopes" },
    });
    return NextResponse.json({ error: "Forbidden: Folder is not in granted scope" }, { status: 403 });
  }

  let body: { value?: unknown; pinned?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (body.value === undefined || body.value === null) {
    return NextResponse.json({ error: "Missing required 'value' field" }, { status: 400 });
  }

  // Check If-Match header for optimistic concurrency
  const ifMatch = request.headers.get("If-Match");
  let expectedVersion: number | undefined = undefined;
  if (ifMatch) {
    const cleaned = ifMatch.replace(/"/g, "").trim();
    expectedVersion = parseInt(cleaned, 10);
    if (isNaN(expectedVersion)) {
      return NextResponse.json({ error: "Invalid If-Match version header" }, { status: 400 });
    }
  }

  const existing = await getEntryByKey(pod.id, targetNs.id, key);

  // If entry doesn't exist, check agentsCanCreate
  if (!existing) {
    if (!targetNs.agentsCanCreate) {
      await logAuditEvent({
        podId: pod.id,
        actorType: "agent",
        agentId: agent.id,
        tokenId: token.id,
        action: "write",
        namespaceId: targetNs.id,
        namespacePath: nsPath,
        key,
        outcome: "denied",
        detail: { reason: "Folder restricts agents to updates only (agents_can_create = false)" },
      });
      return NextResponse.json(
        { error: "Forbidden: This folder restricts agents to updating existing keys only" },
        { status: 403 }
      );
    }

    try {
      const created = await createEntry({
        podId: pod.id,
        namespaceId: targetNs.id,
        key,
        value: body.value,
        pinned: body.pinned ?? false,
        createdByUser: false,
        sourceAgentId: agent.id,
        tokenId: token.id,
      });

      return NextResponse.json(
        { ok: true, key: created.key, version: created.version },
        { status: 201 }
      );
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to create entry" },
        { status: 400 }
      );
    }
  }

  // Updating existing entry: version check
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "write",
      namespaceId: targetNs.id,
      namespacePath: nsPath,
      key,
      outcome: "conflict",
      detail: { expectedVersion, currentVersion: existing.version },
    });

    return NextResponse.json(
      {
        error: `Conflict: Entry is at version ${existing.version}, but If-Match specified ${expectedVersion}`,
        current_version: existing.version,
      },
      { status: 409 }
    );
  }

  try {
    const updated = await updateEntry({
      podId: pod.id,
      entryId: existing.id,
      value: body.value,
      pinned: body.pinned,
      expectedVersion,
      changedByUser: false,
      sourceAgentId: agent.id,
      tokenId: token.id,
    });

    return NextResponse.json({
      ok: true,
      key: updated.key,
      version: updated.version,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update entry" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/v1/memory/[...path]
 * Delete a memory entry.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  const auth = await authenticateAgentToken(
    request.headers.get("Authorization"),
    "memory:delete"
  );

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { agent, token, pod } = auth.context;

  if (path.length < 2) {
    return NextResponse.json(
      { error: "Invalid path. Expected /api/v1/memory/:namespace/:key" },
      { status: 400 }
    );
  }

  const nsPath = path.slice(0, -1).join("/");
  const key = path[path.length - 1];

  const targetNs = await resolveNamespaceByPath(pod.id, nsPath);
  if (!targetNs) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const accessible = await isNamespaceAccessibleToAgent(agent, targetNs.id);
  if (!accessible) {
    return NextResponse.json({ error: "Forbidden: Folder is not in granted scope" }, { status: 403 });
  }

  const existing = await getEntryByKey(pod.id, targetNs.id, key);
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await deleteEntry(pod.id, existing.id, {
    actorType: "agent",
    agentId: agent.id,
    tokenId: token.id,
  });

  return NextResponse.json({ ok: true });
}
