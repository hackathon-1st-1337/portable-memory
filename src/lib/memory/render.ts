import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { type Agent } from "@/db/schema";
import { buildAgentScopeFilter } from "./scope";

export interface ContextPayload {
  markdown: string;
  pinnedCount: number;
  availableKeysCount: number;
}

/**
 * Renders the initial context payload for an agent:
 * 1. Pinned entries rendered as Markdown
 * 2. An index of accessible folders (with descriptions) and available keys
 */
export async function renderAgentContext(agent: Agent): Promise<ContextPayload> {
  const scopeCondition = buildAgentScopeFilter(agent);

  // Fetch all accessible entries (both pinned and unpinned)
  const entryRows = await db.execute(sql`
    SELECT
      memory_entries.id,
      memory_entries.key,
      memory_entries.value_text,
      memory_entries.pinned,
      memory_entries.kind,
      memory_entries.procedure_when,
      namespaces.name as namespace_name,
      namespaces.path::text as namespace_path,
      namespaces.description as namespace_description
    FROM memory_entries
    JOIN namespaces ON memory_entries.namespace_id = namespaces.id
    WHERE ${scopeCondition}
    ORDER BY namespaces.path ASC, memory_entries.key ASC
  `);

  const entries = (entryRows.rows as unknown as {
    id: string;
    key: string;
    value_text: string;
    pinned: boolean;
    kind: string;
    procedure_when: string | null;
    namespace_name: string;
    namespace_path: string;
    namespace_description: string | null;
  }[]) || [];

  const pinned = entries.filter((e) => e.pinned);
  const procedures = entries.filter((e) => e.kind === "procedure");
  const unpinned = entries.filter((e) => !e.pinned && e.kind !== "procedure");

  // Group unpinned by folder
  const folders = new Map<string, { description: string | null; keys: string[] }>();
  for (const e of entries) {
    if (!folders.has(e.namespace_name)) {
      folders.set(e.namespace_name, {
        description: e.namespace_description,
        keys: [],
      });
    }
    if (!e.pinned && e.kind !== "procedure") {
      folders.get(e.namespace_name)!.keys.push(e.key);
    }
  }

  const sections: string[] = [];

  sections.push(`# Portable Memory — Context for ${agent.name}`);
  sections.push(`*Pod ID: ${agent.podId}*\n`);

  if (pinned.length > 0) {
    sections.push("## Pinned Memory Entries\n");
    for (const p of pinned) {
      sections.push(`### [${p.namespace_name}] \`${p.key}\``);
      sections.push(p.value_text);
      sections.push("");
    }
  } else {
    sections.push("## Pinned Memory Entries\n*(No pinned entries in your accessible folders)*\n");
  }

  // Active Procedures (v2)
  if (procedures.length > 0) {
    sections.push("## Active Procedures");
    sections.push("These procedures dictate how tasks should be executed. Fetch full step-by-step instructions via `get_memory`:\n");
    for (const proc of procedures) {
      const trigger = proc.procedure_when ? ` — *When: ${proc.procedure_when}*` : "";
      sections.push(`- **[${proc.namespace_name}] \`${proc.key}\`**${trigger}`);
    }
    sections.push("");
  }

  sections.push("## Available Knowledge Index");
  sections.push(
    "Use `get_memory` with the folder and key, or `search_memory` with a query to fetch details.\n"
  );

  for (const [folderName, data] of folders.entries()) {
    sections.push(`### 📁 ${folderName}`);
    if (data.description) {
      sections.push(`*${data.description}*`);
    }
    if (data.keys.length > 0) {
      sections.push("Keys: " + data.keys.map((k) => `\`${k}\``).join(", "));
    } else {
      sections.push("*(No additional keys)*");
    }
    sections.push("");
  }

  return {
    markdown: sections.join("\n"),
    pinnedCount: pinned.length,
    availableKeysCount: entries.length,
  };
}
