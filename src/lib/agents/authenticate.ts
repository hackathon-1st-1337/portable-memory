import "server-only";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  agentTokens,
  agents,
  pods,
  rateLimitWindows,
  type Agent,
  type AgentToken,
  type Pod,
} from "@/db/schema";
import { hashToken } from "./tokens";
import { hasPermission, type Permission } from "./permissions";
import { logAuditEvent } from "@/lib/memory/audit";

export interface AuthenticatedAgentContext {
  agent: Agent;
  token: AgentToken;
  pod: Pod;
}

export type AuthResult =
  | { success: true; context: AuthenticatedAgentContext }
  | {
      success: false;
      status: 401 | 403 | 429;
      error: string;
      agentId?: string;
      tokenId?: string;
      podId?: string;
    };

/**
 * Authenticate an incoming request bearer token.
 * Validates token hash, expiration, revocation, agent status, pod status, and rate limit.
 */
export async function authenticateAgentToken(
  authHeader: string | null | undefined,
  requiredPermission?: Permission
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      status: 401,
      error: "Missing or malformed Authorization header. Expected 'Bearer pm_live_...'",
    };
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken.startsWith("pm_live_")) {
    return {
      success: false,
      status: 401,
      error: "Invalid token format. Bearer tokens must start with 'pm_live_'",
    };
  }

  const tokenHash = hashToken(rawToken);

  // Look up token joined with agent and pod
  const rows = await db
    .select({
      token: agentTokens,
      agent: agents,
      pod: pods,
    })
    .from(agentTokens)
    .innerJoin(agents, eq(agentTokens.agentId, agents.id))
    .innerJoin(pods, eq(agents.podId, pods.id))
    .where(eq(agentTokens.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) {
    return {
      success: false,
      status: 401,
      error: "Unknown or invalid token",
    };
  }

  const { token, agent, pod } = rows[0];

  // 1. Check token revocation & expiration
  if (token.revokedAt) {
    return {
      success: false,
      status: 401,
      error: "Token has been revoked",
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  if (token.expiresAt && token.expiresAt < new Date()) {
    return {
      success: false,
      status: 401,
      error: "Token has expired",
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  // 2. Check pod status
  if (pod.deletedAt) {
    return {
      success: false,
      status: 403,
      error: "The memory pod associated with this agent has been deleted",
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  // 3. Check agent status and expiration
  if (agent.status !== "active") {
    return {
      success: false,
      status: 403,
      error: `Agent is ${agent.status}`,
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  if (agent.expiresAt && agent.expiresAt < new Date()) {
    return {
      success: false,
      status: 403,
      error: "Agent access has expired",
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  // 4. Check required permission if provided
  if (requiredPermission && !hasPermission(agent.permissions, requiredPermission)) {
    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "denied",
      outcome: "denied",
      detail: { reason: `Missing permission '${requiredPermission}'` },
    });

    return {
      success: false,
      status: 403,
      error: `Agent lacks required permission: ${requiredPermission}`,
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  // 5. Rate limiting (fixed 1-minute window)
  const windowMs = 60000;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  // Upsert window count
  const [windowRow] = await db
    .insert(rateLimitWindows)
    .values({
      agentId: agent.id,
      windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimitWindows.agentId, rateLimitWindows.windowStart],
      set: {
        count: sql`${rateLimitWindows.count} + 1`,
      },
    })
    .returning();

  if (windowRow.count > agent.rateLimitPerMin) {
    await logAuditEvent({
      podId: pod.id,
      actorType: "agent",
      agentId: agent.id,
      tokenId: token.id,
      action: "rate_limited",
      outcome: "rate_limited",
      detail: {
        limit: agent.rateLimitPerMin,
        current: windowRow.count,
      },
    });

    return {
      success: false,
      status: 429,
      error: `Rate limit exceeded (${agent.rateLimitPerMin} requests/min). Try again shortly.`,
      agentId: agent.id,
      tokenId: token.id,
      podId: pod.id,
    };
  }

  // 6. Update last_used_at and last_seen_at asynchronously (don't block request)
  db.update(agentTokens)
    .set({ lastUsedAt: now })
    .where(eq(agentTokens.id, token.id))
    .catch((err) => console.error("Failed to update token lastUsedAt", err));

  db.update(agents)
    .set({ lastSeenAt: now })
    .where(eq(agents.id, agent.id))
    .catch((err) => console.error("Failed to update agent lastSeenAt", err));

  return {
    success: true,
    context: { agent, token, pod },
  };
}
