import "server-only";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/client";
import {
  agents,
  agentScopes,
  agentTokens,
  namespaces,
  type Agent,
  type AgentToken,
} from "@/db/schema";
import { generateToken } from "./tokens";
import { validatePermissions, type Permission } from "./permissions";
import { logAuditEvent } from "@/lib/memory/audit";

export interface AgentWithDetails extends Agent {
  activeTokenCount: number;
  grantedFolderCount: number;
}

/**
 * List all agents for a pod.
 */
export async function listPodAgents(podId: string): Promise<AgentWithDetails[]> {
  const allAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.podId, podId))
    .orderBy(desc(agents.createdAt));

  // Count active tokens
  const tokenCounts = await db
    .select({
      agentId: agentTokens.agentId,
      count: sql<number>`count(*)::int`,
    })
    .from(agentTokens)
    .where(sql`revoked_at IS NULL`)
    .groupBy(agentTokens.agentId);

  const tokenCountMap = new Map(tokenCounts.map((r) => [r.agentId, r.count]));

  // Count scopes
  const scopeCounts = await db
    .select({
      agentId: agentScopes.agentId,
      count: sql<number>`count(*)::int`,
    })
    .from(agentScopes)
    .groupBy(agentScopes.agentId);

  const scopeCountMap = new Map(scopeCounts.map((r) => [r.agentId, r.count]));

  return allAgents.map((a) => ({
    ...a,
    activeTokenCount: tokenCountMap.get(a.id) ?? 0,
    grantedFolderCount: a.allNamespaces ? -1 : scopeCountMap.get(a.id) ?? 0,
  }));
}

/**
 * Get agent by ID with granted folders and tokens.
 */
export async function getAgentById(podId: string, agentId: string) {
  const agentRows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.podId, podId)))
    .limit(1);

  if (agentRows.length === 0) return null;
  const agent = agentRows[0];

  // Get tokens
  const tokens = await db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.agentId, agentId))
    .orderBy(desc(agentTokens.createdAt));

  // Get granted folders
  const scopes = await db
    .select({
      namespaceId: agentScopes.namespaceId,
      name: namespaces.name,
      path: namespaces.path,
    })
    .from(agentScopes)
    .innerJoin(namespaces, eq(agentScopes.namespaceId, namespaces.id))
    .where(eq(agentScopes.agentId, agentId));

  return {
    agent,
    tokens,
    scopes,
  };
}

/**
 * Create a new agent, assign scopes, and issue its initial token.
 * Returns the raw token (only time it is exposed).
 */
export async function createAgent(
  podId: string,
  data: {
    name: string;
    platform: string;
    description?: string;
    permissions: string[];
    allNamespaces?: boolean;
    folderIds?: string[];
    rateLimitPerMin?: number;
    expiresAt?: Date | null;
  }
): Promise<{ agent: Agent; rawToken: string; prefix: string; tokenId: string }> {
  const name = data.name.trim();
  if (!name) throw new Error("Agent name cannot be empty");

  const validatedPermissions = validatePermissions(data.permissions);

  const [agent] = await db
    .insert(agents)
    .values({
      podId,
      name,
      platform: data.platform.trim().toLowerCase(),
      description: data.description?.trim() || null,
      permissions: validatedPermissions,
      allNamespaces: data.allNamespaces ?? false,
      status: "active",
      rateLimitPerMin: data.rateLimitPerMin ?? 60,
      expiresAt: data.expiresAt || null,
    })
    .returning();

  // Insert scopes if not allNamespaces
  if (!agent.allNamespaces && data.folderIds && data.folderIds.length > 0) {
    for (const folderId of data.folderIds) {
      await db
        .insert(agentScopes)
        .values({ agentId: agent.id, namespaceId: folderId })
        .onConflictDoNothing();
    }
  }

  // Issue primary token
  const generated = generateToken();
  const [tokenRow] = await db
    .insert(agentTokens)
    .values({
      agentId: agent.id,
      tokenHash: generated.tokenHash,
      prefix: generated.prefix,
      label: "Initial token",
    })
    .returning();

  await logAuditEvent({
    podId,
    actorType: "user",
    agentId: agent.id,
    tokenId: tokenRow.id,
    action: "agent.create",
    outcome: "ok",
    detail: { name: agent.name, platform: agent.platform },
  });

  return {
    agent,
    rawToken: generated.rawToken,
    prefix: generated.prefix,
    tokenId: tokenRow.id,
  };
}

/**
 * Update agent identity and permissions.
 */
export async function updateAgent(
  podId: string,
  agentId: string,
  data: {
    name?: string;
    description?: string;
    permissions?: string[];
    allNamespaces?: boolean;
    folderIds?: string[];
    rateLimitPerMin?: number;
    status?: "active" | "paused" | "revoked";
  }
): Promise<Agent> {
  const updates: Partial<typeof agents.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw new Error("Agent name cannot be empty");
    updates.name = name;
  }

  if (data.description !== undefined) {
    updates.description = data.description.trim() || null;
  }

  if (data.permissions !== undefined) {
    updates.permissions = validatePermissions(data.permissions);
  }

  if (data.allNamespaces !== undefined) {
    updates.allNamespaces = data.allNamespaces;
  }

  if (data.rateLimitPerMin !== undefined) {
    updates.rateLimitPerMin = data.rateLimitPerMin;
  }

  if (data.status !== undefined) {
    updates.status = data.status;
  }

  const [updated] = await db
    .update(agents)
    .set(updates)
    .where(and(eq(agents.id, agentId), eq(agents.podId, podId)))
    .returning();

  if (!updated) throw new Error("Agent not found");

  // If folderIds provided, update scopes
  if (data.folderIds !== undefined) {
    await db.delete(agentScopes).where(eq(agentScopes.agentId, agentId));
    if (!updated.allNamespaces) {
      for (const folderId of data.folderIds) {
        await db
          .insert(agentScopes)
          .values({ agentId, namespaceId: folderId })
          .onConflictDoNothing();
      }
    }
  }

  await logAuditEvent({
    podId,
    actorType: "user",
    agentId,
    action: "agent.update",
    outcome: "ok",
    detail: { status: updated.status, allNamespaces: updated.allNamespaces },
  });

  return updated;
}

/**
 * Issue a new token for an existing agent.
 */
export async function issueAgentToken(
  podId: string,
  agentId: string,
  label?: string
): Promise<{ token: AgentToken; rawToken: string; prefix: string }> {
  // Verify agent exists and belongs to pod
  const agent = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.podId, podId)))
    .limit(1);

  if (agent.length === 0) throw new Error("Agent not found");

  const generated = generateToken();
  const [token] = await db
    .insert(agentTokens)
    .values({
      agentId,
      tokenHash: generated.tokenHash,
      prefix: generated.prefix,
      label: label?.trim() || null,
    })
    .returning();

  await logAuditEvent({
    podId,
    actorType: "user",
    agentId,
    tokenId: token.id,
    action: "token.create",
    outcome: "ok",
    detail: { prefix: generated.prefix, label: token.label },
  });

  return {
    token,
    rawToken: generated.rawToken,
    prefix: generated.prefix,
  };
}

/**
 * Revoke an agent token. Immediately blocks further API access with that token.
 */
export async function revokeAgentToken(
  podId: string,
  agentId: string,
  tokenId: string
): Promise<void> {
  const [token] = await db
    .update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentTokens.id, tokenId), eq(agentTokens.agentId, agentId)))
    .returning();

  if (!token) throw new Error("Token not found");

  await logAuditEvent({
    podId,
    actorType: "user",
    agentId,
    tokenId,
    action: "token.revoke",
    outcome: "ok",
    detail: { prefix: token.prefix },
  });
}
