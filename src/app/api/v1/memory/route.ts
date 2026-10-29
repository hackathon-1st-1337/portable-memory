import { NextRequest, NextResponse } from "next/server";
import { authenticateAgentToken } from "@/lib/agents/authenticate";
import { hasPermission } from "@/lib/agents/permissions";
import { listEntries } from "@/lib/memory/entries";
import { buildAgentScopeFilter } from "@/lib/memory/scope";
import { db } from "@/db/client";
import { memoryEntries, namespaces } from "@/db/schema";
import { logAuditEvent } from "@/lib/memory/audit";
import { sql } from "drizzle-orm";

/**
 * GET /api/v1/memory
 * List all entries accessible to the calling agent based on its folder scopes.
 * If agent has 'memory:read', returns keys and values.
 * If agent has only 'memory:list', returns keys without values.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgentToken(
    request.headers.get("Authorization")
  );

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { agent, token, pod } = auth.context;

  // Check permissions: either memory:read or memory:list is required
  const canRead = hasPermission(agent.permissions, "memory:read");
  const canList = hasPermission(agent.permissions, "memory:list");

  if (!canRead && !canList) {
    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "list",
      outcome: "denied",
      detail: { reason: "Requires memory:read or memory:list permission" },
    });
    return NextResponse.json(
      { error: "Forbidden: Agent requires 'memory:read' or 'memory:list' permission" },
      { status: 403 }
    );
  }

  const scopeCondition = buildAgentScopeFilter(agent);

  const rows = await db.execute(sql`
    SELECT
      memory_entries.key,
      ${canRead ? sql`memory_entries.value,` : sql`NULL as value,`}
      memory_entries.pinned,
      memory_entries.version,
      memory_entries.updated_at,
      namespaces.name as namespace
    FROM memory_entries
    JOIN namespaces ON memory_entries.namespace_id = namespaces.id
    WHERE ${scopeCondition}
    ORDER BY namespaces.name ASC, memory_entries.key ASC
  `);

  const results = (rows.rows as unknown as {
    key: string;
    value: unknown;
    pinned: boolean;
    version: number;
    updated_at: string;
    namespace: string;
  }[]) || [];

  await logAuditEvent({
    podId: pod.id,
    actorType: "agent",
    agentId: agent.id,
    tokenId: token.id,
    action: canRead ? "read" : "list",
    outcome: "ok",
    detail: { count: results.length },
  });

  return NextResponse.json({
    entries: results.map((r) => ({
      namespace: r.namespace,
      key: r.key,
      ...(canRead ? { value: r.value } : {}),
      pinned: r.pinned,
      version: r.version,
      updated_at: r.updated_at,
    })),
  });
}
