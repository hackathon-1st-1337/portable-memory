import "server-only";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, agents, type AuditEvent, type NewAuditEvent } from "@/db/schema";

export interface LogAuditParams {
  podId: string;
  actorType: "agent" | "user";
  agentId?: string | null;
  tokenId?: string | null;
  action: string;
  namespaceId?: string | null;
  namespacePath?: string | null;
  key?: string | null;
  outcome: "ok" | "denied" | "not_found" | "rate_limited" | "conflict";
  detail?: Record<string, unknown> | null;
}

/**
 * Append an entry to the audit log.
 * Never logs memory entry values (privacy / security).
 */
export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      podId: params.podId,
      actorType: params.actorType,
      agentId: params.agentId || null,
      tokenId: params.tokenId || null,
      action: params.action,
      namespaceId: params.namespaceId || null,
      namespacePath: params.namespacePath || null,
      key: params.key || null,
      outcome: params.outcome,
      detail: params.detail || null,
    });
  } catch (err) {
    // Audit logging should never crash the primary request path, but log to stderr
    console.error("Failed to write audit event:", err);
  }
}

export interface AuditFilterParams {
  agentId?: string;
  action?: string;
  namespaceId?: string;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditEventWithAgent extends AuditEvent {
  agentName?: string | null;
  agentPlatform?: string | null;
}

/**
 * List audit events for a pod with filtering.
 */
export async function listAuditEvents(
  podId: string,
  filters: AuditFilterParams = {}
): Promise<AuditEventWithAgent[]> {
  const conditions = [eq(auditEvents.podId, podId)];

  if (filters.agentId) {
    conditions.push(eq(auditEvents.agentId, filters.agentId));
  }
  if (filters.action) {
    conditions.push(eq(auditEvents.action, filters.action));
  }
  if (filters.namespaceId) {
    conditions.push(eq(auditEvents.namespaceId, filters.namespaceId));
  }
  if (filters.outcome) {
    conditions.push(eq(auditEvents.outcome, filters.outcome));
  }
  if (filters.startDate) {
    conditions.push(gte(auditEvents.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(auditEvents.createdAt, filters.endDate));
  }

  const limit = Math.min(filters.limit ?? 100, 250);
  const offset = filters.offset ?? 0;

  const rows = await db
    .select({
      event: auditEvents,
      agent: {
        id: agents.id,
        name: agents.name,
        platform: agents.platform,
      },
    })
    .from(auditEvents)
    .leftJoin(agents, eq(auditEvents.agentId, agents.id))
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r.event,
    agentName: r.agent?.name ?? null,
    agentPlatform: r.agent?.platform ?? null,
  }));
}
