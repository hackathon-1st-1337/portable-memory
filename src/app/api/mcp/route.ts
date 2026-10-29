import { NextRequest, NextResponse } from "next/server";
import { authenticateAgentToken } from "@/lib/agents/authenticate";
import { hasPermission } from "@/lib/agents/permissions";
import { renderAgentContext } from "@/lib/memory/render";
import { searchMemory } from "@/lib/memory/search";
import {
  resolveNamespaceByPath,
  getNamespacePathString,
} from "@/lib/memory/namespaces";
import {
  getEntryByKey,
  createEntry,
  updateEntry,
  deleteEntry,
} from "@/lib/memory/entries";
import { isNamespaceAccessibleToAgent } from "@/lib/memory/scope";
import { logAuditEvent } from "@/lib/memory/audit";
import { exploreMemory } from "@/lib/memory/graph";

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  // 1. Authenticate bearer token
  const auth = await authenticateAgentToken(
    request.headers.get("Authorization")
  );

  if (!auth.success) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: auth.status === 429 ? -32000 : -32600,
          message: auth.error,
        },
      },
      { status: auth.status }
    );
  }

  const { agent, token, pod } = auth.context;

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: Invalid JSON" },
      },
      { status: 400 }
    );
  }

  // Handle single request (or batch)
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((req) => handleSingleMcpRequest(req, agent, token, pod))
    );
    return NextResponse.json(responses.filter(Boolean));
  } else {
    const response = await handleSingleMcpRequest(body, agent, token, pod);
    if (!response) {
      // Notification
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(response);
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: "Portable Memory MCP Server",
    version: "1.0.0",
    protocol: "mcp/2024-11-05",
    description: "Connect your AI agent with sovereign, scoped memory.",
    authentication: "Bearer pm_live_...",
  });
}

async function handleSingleMcpRequest(
  req: JsonRpcRequest,
  agent: any,
  token: any,
  pod: any
): Promise<Record<string, unknown> | null> {
  const { id = null, method, params = {} } = req;

  // Notification (no ID)
  if (id === undefined || id === null) {
    if (method === "notifications/initialized") {
      return null;
    }
  }

  // MCP Protocol Handshake
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "portable-memory",
          version: "1.0.0",
        },
      },
    };
  }

  // List Available Tools (filtered by permissions)
  if (method === "tools/list") {
    const canRead = hasPermission(agent.permissions, "memory:read");
    const canWrite = hasPermission(agent.permissions, "memory:write");
    const canDelete = hasPermission(agent.permissions, "memory:delete");

    const tools = [];

    if (canRead) {
      tools.push({
        name: "get_context",
        description:
          "Fetch pinned personal memory entries as Markdown context, along with an index of accessible folders and available keys.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      });

      tools.push({
        name: "search_memory",
        description:
          "Search personal memory entries across granted folders using full-text and fuzzy keyword search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Keywords or topic to search for",
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return (default 10)",
            },
          },
          required: ["query"],
        },
      });

      tools.push({
        name: "get_memory",
        description:
          "Retrieve a specific memory entry by folder path and key.",
        inputSchema: {
          type: "object",
          properties: {
            folder: {
              type: "string",
              description: "Folder path (e.g. 'preferences' or 'projects/portable-memory')",
            },
            key: {
              type: "string",
              description: "Key name of the entry (e.g. 'tone' or 'tech_stack')",
            },
          },
          required: ["folder", "key"],
        },
      });

      tools.push({
        name: "explore_memory",
        description:
          "Explore connected knowledge, entities, and relations across personal memory via the Knowledge Graph. Scoped strictly to folders your agent has access to.",
        inputSchema: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              description: "The name of the entity or concept to explore (e.g. 'Next.js', 'Postgres', 'Alex')",
            },
            depth: {
              type: "number",
              description: "Depth of graph exploration (1 to 3, default 1)",
            },
          },
          required: ["entity"],
        },
      });
    }

    if (canWrite) {
      tools.push({
        name: "save_memory",
        description:
          "Create or update a memory entry in an allowed folder. Supports facts, events, and procedures (with trigger conditions), and optimistic concurrency via expected_version.",
        inputSchema: {
          type: "object",
          properties: {
            folder: {
              type: "string",
              description: "Target folder path (e.g. 'preferences' or 'notes')",
            },
            key: {
              type: "string",
              description: "Unique key for this memory entry (lowercase alphanumeric and dots/hyphens)",
            },
            value: {
              description: "The memory value to store (string, JSON object, or array)",
            },
            kind: {
              type: "string",
              enum: ["fact", "event", "procedure"],
              description: "The kind of memory: 'fact' (default), 'event', or 'procedure'",
            },
            procedure_when: {
              type: "string",
              description: "Trigger condition when kind is 'procedure' (e.g. 'When deploying code to production')",
            },
            pinned: {
              type: "boolean",
              description: "Whether this entry should be pinned and returned in initial get_context",
            },
            expected_version: {
              type: "number",
              description: "Optional expected current version for optimistic concurrency control",
            },
          },
          required: ["folder", "key", "value"],
        },
      });
    }

    if (canDelete) {
      tools.push({
        name: "forget_memory",
        description:
          "Soft delete a memory entry from your memory store.",
        inputSchema: {
          type: "object",
          properties: {
            folder: {
              type: "string",
              description: "Folder path containing the entry",
            },
            key: {
              type: "string",
              description: "Key of the entry to forget",
            },
          },
          required: ["folder", "key"],
        },
      });
    }

    return {
      jsonrpc: "2.0",
      id,
      result: { tools },
    };
  }

  // Call Tool
  if (method === "tools/call") {
    const toolName = (params as any).name;
    const args = ((params as any).arguments || {}) as Record<string, any>;

    try {
      // 1. get_context
      if (toolName === "get_context") {
        if (!hasPermission(agent.permissions, "memory:read")) {
          return mcpError(id, -32001, "Permission denied: requires memory:read");
        }
        const ctx = await renderAgentContext(agent);
        await logAuditEvent({
          podId: pod.id,
          actorType: "agent",
          agentId: agent.id,
          tokenId: token.id,
          action: "context",
          outcome: "ok",
          detail: { pinned: ctx.pinnedCount, available: ctx.availableKeysCount },
        });

        return mcpSuccess(id, ctx.markdown);
      }

      // 2. search_memory
      if (toolName === "search_memory") {
        if (!hasPermission(agent.permissions, "memory:read")) {
          return mcpError(id, -32001, "Permission denied: requires memory:read");
        }
        const query = String(args.query || "");
        const limit = Number(args.limit) || 10;
        const results = await searchMemory(pod.id, query, { agent, limit });

        await logAuditEvent({
          podId: pod.id,
          actorType: "agent",
          agentId: agent.id,
          tokenId: token.id,
          action: "search",
          outcome: "ok",
          detail: { query, results: results.length },
        });

        if (results.length === 0) {
          return mcpSuccess(id, `No memory entries matching "${query}" were found.`);
        }

        const formatted = results.map((r) => {
          return `### [${r.namespaceName}] ${r.key}\n${r.valueText}\n(version: ${r.version}, score: ${r.rank.toFixed(2)})`;
        }).join("\n\n");

        return mcpSuccess(id, formatted);
      }

      // 3. get_memory
      if (toolName === "get_memory") {
        if (!hasPermission(agent.permissions, "memory:read")) {
          return mcpError(id, -32001, "Permission denied: requires memory:read");
        }
        const folder = String(args.folder || "");
        const key = String(args.key || "");

        const ns = await resolveNamespaceByPath(pod.id, folder);
        if (!ns) {
          return mcpError(id, -32004, `Folder '${folder}' not found`);
        }

        const accessible = await isNamespaceAccessibleToAgent(agent, ns.id);
        if (!accessible) {
          return mcpError(id, -32003, `Access denied: Folder '${folder}' is not in your granted scopes`);
        }

        const entry = await getEntryByKey(pod.id, ns.id, key);
        if (!entry || entry.visibility === "private") {
          return mcpError(id, -32004, `Memory entry '${key}' in folder '${folder}' not found`);
        }

        await logAuditEvent({
          podId: pod.id,
          actorType: "agent",
          agentId: agent.id,
          tokenId: token.id,
          action: "read",
          namespaceId: ns.id,
          namespacePath: folder,
          key,
          outcome: "ok",
        });

        return mcpSuccess(
          id,
          typeof entry.value === "string"
            ? entry.value
            : JSON.stringify(entry.value, null, 2)
        );
      }

      // 4. explore_memory (Knowledge Graph)
      if (toolName === "explore_memory") {
        if (!hasPermission(agent.permissions, "memory:read")) {
          return mcpError(id, -32001, "Permission denied: requires memory:read");
        }
        const entityQuery = String(args.entity || "");
        const depth = Math.min(Math.max(Number(args.depth) || 1, 1), 3);

        const graph = await exploreMemory(pod.id, entityQuery, depth, agent);

        await logAuditEvent({
          podId: pod.id,
          actorType: "agent",
          agentId: agent.id,
          tokenId: token.id,
          action: "explore_graph",
          outcome: "ok",
          detail: { entityQuery, depth, found: !!graph },
        });

        if (!graph || (graph.connectedEntities.length === 0 && graph.relations.length === 0)) {
          return mcpSuccess(
            id,
            `No knowledge graph connections found for '${entityQuery}' in your granted namespaces.`
          );
        }

        const lines = [
          `# Knowledge Graph: ${graph.rootEntity.name} (${graph.rootEntity.type})`,
        ];

        if (graph.connectedEntities.length > 0) {
          lines.push(`\n## Connected Entities:`);
          for (const ent of graph.connectedEntities) {
            lines.push(`- **${ent.name}** (${ent.type})`);
          }
        }

        if (graph.relations.length > 0) {
          lines.push(`\n## Relations (source-scoped):`);
          for (const rel of graph.relations) {
            lines.push(
              `- ${rel.subjectName} --[${rel.predicate}]--> ${rel.objectName} (confidence: ${(rel.confidence * 100).toFixed(0)}%, source: [${rel.sourceNamespaceName}] ${rel.sourceEntryKey})`
            );
          }
        }

        return mcpSuccess(id, lines.join("\n"));
      }

      // 5. save_memory
      if (toolName === "save_memory") {
        if (!hasPermission(agent.permissions, "memory:write")) {
          return mcpError(id, -32001, "Permission denied: requires memory:write");
        }
        const folder = String(args.folder || "");
        const key = String(args.key || "");
        const value = args.value;
        const pinned = Boolean(args.pinned);
        const kind = (args.kind === "procedure" || args.kind === "event") ? args.kind : "fact";
        const procedureWhen = args.procedure_when ? String(args.procedure_when) : undefined;
        const expectedVersion = typeof args.expected_version === "number" ? args.expected_version : undefined;

        const ns = await resolveNamespaceByPath(pod.id, folder);
        if (!ns) {
          return mcpError(id, -32004, `Folder '${folder}' not found`);
        }

        const accessible = await isNamespaceAccessibleToAgent(agent, ns.id);
        if (!accessible) {
          return mcpError(id, -32003, `Access denied: Folder '${folder}' is not in your granted scopes`);
        }

        const existing = await getEntryByKey(pod.id, ns.id, key);

        if (!existing) {
          if (!ns.agentsCanCreate) {
            return mcpError(id, -32003, `This folder '${folder}' restricts agents to updating existing keys only`);
          }

          const created = await createEntry({
            podId: pod.id,
            namespaceId: ns.id,
            key,
            value,
            pinned,
            kind,
            procedureWhen,
            createdByUser: false,
            sourceAgentId: agent.id,
            tokenId: token.id,
          });

          if (created.status === "draft") {
            return mcpSuccess(
              id,
              `Successfully submitted memory entry '${key}' as a draft in folder '${folder}'. This folder requires human review before the memory becomes active.`
            );
          }

          return mcpSuccess(
            id,
            `Successfully saved memory entry '${key}' in folder '${folder}' (version: ${created.version}).`
          );
        } else {
          if (expectedVersion !== undefined && existing.version !== expectedVersion) {
            return mcpError(
              id,
              -32009,
              `Conflict: Entry '${key}' is currently at version ${existing.version}, but expected version was ${expectedVersion}.`
            );
          }

          const updated = await updateEntry({
            podId: pod.id,
            entryId: existing.id,
            value,
            pinned,
            kind: args.kind ? kind : undefined,
            procedureWhen,
            expectedVersion,
            changedByUser: false,
            sourceAgentId: agent.id,
            tokenId: token.id,
          });

          if (updated.status === "draft") {
            return mcpSuccess(
              id,
              `Successfully submitted update for memory entry '${key}' in folder '${folder}' as a draft for human review.`
            );
          }

          return mcpSuccess(
            id,
            `Successfully updated memory entry '${key}' in folder '${folder}' to version ${updated.version}.`
          );
        }
      }

      // 5. forget_memory
      if (toolName === "forget_memory") {
        if (!hasPermission(agent.permissions, "memory:delete")) {
          return mcpError(id, -32001, "Permission denied: requires memory:delete");
        }
        const folder = String(args.folder || "");
        const key = String(args.key || "");

        const ns = await resolveNamespaceByPath(pod.id, folder);
        if (!ns) return mcpError(id, -32004, `Folder '${folder}' not found`);

        const accessible = await isNamespaceAccessibleToAgent(agent, ns.id);
        if (!accessible) return mcpError(id, -32003, "Access denied to folder");

        const existing = await getEntryByKey(pod.id, ns.id, key);
        if (!existing) return mcpError(id, -32004, `Entry '${key}' not found in '${folder}'`);

        await deleteEntry(pod.id, existing.id, {
          actorType: "agent",
          agentId: agent.id,
          tokenId: token.id,
        });

        return mcpSuccess(id, `Successfully forgot memory entry '${key}' from folder '${folder}'.`);
      }

      return mcpError(id, -32601, `Unknown tool '${toolName}'`);
    } catch (err: unknown) {
      return mcpError(id, -32000, err instanceof Error ? err.message : "Internal tool execution error");
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}

function mcpSuccess(id: string | number | null, text: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text,
        },
      ],
    },
  };
}

function mcpError(id: string | number | null, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}
