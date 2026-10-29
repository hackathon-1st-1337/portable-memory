import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { agentScopes, namespaces, type Agent } from "@/db/schema";

/**
 * Returns a SQL condition fragment that restricts entries to those visible by the agent:
 * 1. entry.pod_id = agent.pod_id
 * 2. entry.deleted_at IS NULL
 * 3. entry.visibility <> 'private'
 * 4. namespace.deleted_at IS NULL
 * 5. If agent.all_namespaces = false:
 *    namespace.path <@ ANY(SELECT path FROM namespaces WHERE id IN (SELECT namespace_id FROM agent_scopes WHERE agent_id = agent.id))
 */
export function buildAgentScopeFilter(agent: Agent): SQL {
  const podCondition = sql`memory_entries.pod_id = ${agent.podId}`;
  const notDeleted = sql`memory_entries.deleted_at IS NULL`;
  const nonPrivate = sql`memory_entries.visibility <> 'private'`;
  const nsNotDeleted = sql`namespaces.deleted_at IS NULL`;
  const isLive = sql`memory_entries.status = 'live'`;

  if (agent.allNamespaces) {
    return sql`${podCondition} AND ${notDeleted} AND ${nonPrivate} AND ${nsNotDeleted} AND ${isLive}`;
  }

  const subtreeGrant = sql`EXISTS (
    SELECT 1 FROM agent_scopes s
    JOIN namespaces gn ON s.namespace_id = gn.id
    WHERE s.agent_id = ${agent.id}
      AND gn.deleted_at IS NULL
      AND namespaces.path <@ gn.path
  )`;

  return sql`${podCondition} AND ${notDeleted} AND ${nonPrivate} AND ${nsNotDeleted} AND ${isLive} AND ${subtreeGrant}`;
}

/**
 * Checks if a specific namespace is accessible to an agent.
 */
export async function isNamespaceAccessibleToAgent(
  agent: Agent,
  namespaceId: string
): Promise<boolean> {
  if (agent.allNamespaces) {
    const rows = await db
      .select({ id: namespaces.id })
      .from(namespaces)
      .where(
        sql`id = ${namespaceId} AND pod_id = ${agent.podId} AND deleted_at IS NULL`
      )
      .limit(1);
    return rows.length > 0;
  }

  const result = await db.execute(sql`
    SELECT 1 FROM namespaces target_ns
    WHERE target_ns.id = ${namespaceId}
      AND target_ns.pod_id = ${agent.podId}
      AND target_ns.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM agent_scopes s
        JOIN namespaces gn ON s.namespace_id = gn.id
        WHERE s.agent_id = ${agent.id}
          AND gn.deleted_at IS NULL
          AND target_ns.path <@ gn.path
      )
    LIMIT 1
  `);

  return result.rows.length > 0;
}
