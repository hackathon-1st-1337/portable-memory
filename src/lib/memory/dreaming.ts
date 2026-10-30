import "server-only";

import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  dreamRuns,
  dreamSuggestions,
  memoryEntries,
  namespaces,
  type DreamRun,
  type DreamSuggestion,
} from "@/db/schema";
import { logAuditEvent } from "./audit";
import { runReasoning } from "@/lib/ai/nebius";
import { createOrGetEntity, createRelation } from "./graph";
import { updateEntry, deleteEntry } from "./entries";

export interface DreamStats {
  entriesScanned: number;
  suggestionsMade: number;
  durationMs: number;
  [key: string]: unknown;
}

/**
 * Execute a Dream consolidation cycle for a pod.
 * Scans memory entries, runs LLM analysis, and generates proposals for the user to review.
 */
export async function runDreamCycle(podId: string): Promise<DreamRun> {
  const startTime = Date.now();

  // 1. Create a running dream_run
  const [run] = await db
    .insert(dreamRuns)
    .values({
      podId,
      status: "running",
      stats: { entriesScanned: 0, suggestionsMade: 0 },
    })
    .returning();

  try {
    // 2. Fetch live memory entries in the pod
    const entries = await db
      .select({
        id: memoryEntries.id,
        key: memoryEntries.key,
        valueText: memoryEntries.valueText,
        namespaceId: memoryEntries.namespaceId,
        namespaceName: namespaces.name,
        kind: memoryEntries.kind,
        updatedAt: memoryEntries.updatedAt,
      })
      .from(memoryEntries)
      .innerJoin(namespaces, eq(memoryEntries.namespaceId, namespaces.id))
      .where(
        and(
          eq(memoryEntries.podId, podId),
          eq(memoryEntries.status, "live"),
          sql`${memoryEntries.deletedAt} IS NULL`
        )
      )
      .limit(50);

    const suggestions: Array<{
      type: "merge" | "contradiction" | "stale" | "promote" | "graph";
      entryIds: string[];
      proposal: Record<string, any>;
      rationale: string;
    }> = [];

    if (entries.length >= 2) {
      // Build summary for LLM prompt
      const entriesSummary = entries.map((e, idx) => {
        return `[#${idx + 1}] ID:${e.id} Folder:${e.namespaceName} Key:${e.key} Kind:${e.kind} Value:"${e.valueText}"`;
      }).join("\n");

      const systemPrompt = `You are the Memory Consolidation Engine ("Dreaming") for a user's personal memory pod.
Your role is to inspect stored memory entries and output structured JSON proposals to organize, refine, and connect them.

Analyze the entries and find:
1. "merge": near-duplicate or overlapping entries that should be merged.
2. "contradiction": conflicting statements (e.g. vegetarian vs eating fish).
3. "promote": casual notes that describe persistent habits or procedures to elevate.
4. "graph": entities (person, project, place, org, tool, concept) and relationships (works_on, prefers, uses, lives_in, decided).

Format your output strictly as a JSON array of suggestions:
[
  {
    "type": "merge" | "contradiction" | "promote" | "graph",
    "entryIndices": [1, 2],
    "rationale": "Why this action is proposed",
    "proposal": { ...details... }
  }
]
For "graph", the proposal must contain:
{
  "subject": {"name": "...", "type": "person"|"project"|"place"|"org"|"tool"|"concept"},
  "predicate": "works_on"|"prefers"|"uses"|"lives_in"|"decided",
  "object": {"name": "...", "type": "person"|"project"|"place"|"org"|"tool"|"concept"},
  "sourceEntryIndex": 1,
  "confidence": 0.95
}
`;

      const userPrompt = `Here are the active memory entries:\n\n${entriesSummary}\n\nReturn JSON only.`;

      let llmText = "";
      const chatRes = await runReasoning([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      if (chatRes && chatRes.text) {
        llmText = chatRes.text;
      }

      // Parse JSON from LLM output
      try {
        let cleaned = llmText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]");
        if (start !== -1 && end !== -1 && end > start) {
          cleaned = cleaned.slice(start, end + 1);
        }
        cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

        let parsed: any[] = [];
        try {
          const direct = JSON.parse(cleaned);
          if (Array.isArray(direct)) {
            parsed = direct;
          }
        } catch {
          // Fallback: match individual objects
          const objectMatches = cleaned.match(/\{[\s\S]*?\}(?=\s*,\s*\{|\s*\])/g) || [];
          for (const objStr of objectMatches) {
            try {
              const fixed = objStr.replace(/,\s*([}\]])/g, "$1");
              parsed.push(JSON.parse(fixed));
            } catch {
              // ignore malformed snippet
            }
          }
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
              const involvedIds: string[] = [];
              if (Array.isArray(item.entryIndices)) {
                for (const idx of item.entryIndices) {
                  const zeroIdx = Number(idx) - 1;
                  if (entries[zeroIdx]) {
                    involvedIds.push(entries[zeroIdx].id);
                  }
                }
              }
              if (item.proposal?.sourceEntryIndex) {
                const zeroIdx = Number(item.proposal.sourceEntryIndex) - 1;
                if (entries[zeroIdx]) {
                  item.proposal.sourceEntryId = entries[zeroIdx].id;
                }
              }

              if (involvedIds.length > 0 || item.proposal?.sourceEntryId) {
                suggestions.push({
                  type: item.type || "graph",
                  entryIds: involvedIds.length > 0 ? involvedIds : [item.proposal.sourceEntryId],
                  proposal: item.proposal || {},
                  rationale: item.rationale || "Suggested consolidation",
                });
              }
            }
          }
      } catch (e) {
        console.error("Failed to parse LLM dream response:", e);
      }
    }

    // Insert suggestions into dream_suggestions
    for (const s of suggestions) {
      await db.insert(dreamSuggestions).values({
        runId: run.id,
        podId,
        type: s.type,
        entryIds: s.entryIds,
        proposal: s.proposal,
        rationale: s.rationale,
        status: "pending",
      });
    }

    const durationMs = Date.now() - startTime;
    const stats: DreamStats = {
      entriesScanned: entries.length,
      suggestionsMade: suggestions.length,
      durationMs,
    };

    const [finished] = await db
      .update(dreamRuns)
      .set({
        finishedAt: new Date(),
        status: "done",
        stats,
      })
      .where(eq(dreamRuns.id, run.id))
      .returning();

    await logAuditEvent({
      podId,
      actorType: "user",
      action: "dream.run",
      outcome: "ok",
      detail: stats,
    });

    return finished;
  } catch (err: any) {
    await db
      .update(dreamRuns)
      .set({
        finishedAt: new Date(),
        status: "failed",
        stats: { error: err?.message || String(err) },
      })
      .where(eq(dreamRuns.id, run.id));

    throw err;
  }
}

/**
 * List dream suggestions for a pod.
 */
export async function listSuggestions(
  podId: string,
  status?: "pending" | "accepted" | "dismissed"
): Promise<DreamSuggestion[]> {
  const conditions = [eq(dreamSuggestions.podId, podId)];
  if (status) {
    conditions.push(eq(dreamSuggestions.status, status));
  }

  return db
    .select()
    .from(dreamSuggestions)
    .where(and(...conditions))
    .orderBy(desc(dreamSuggestions.decidedAt), desc(dreamSuggestions.id))
    .limit(50);
}

/**
 * List past dream runs for a pod.
 */
export async function listDreamRuns(podId: string): Promise<DreamRun[]> {
  return db
    .select()
    .from(dreamRuns)
    .where(eq(dreamRuns.podId, podId))
    .orderBy(desc(dreamRuns.startedAt))
    .limit(20);
}

/**
 * Accept a suggestion: applies the proposal to the memory store or graph.
 */
export async function acceptSuggestion(
  podId: string,
  suggestionId: string,
  userId?: string
): Promise<DreamSuggestion> {
  const [s] = await db
    .select()
    .from(dreamSuggestions)
    .where(and(eq(dreamSuggestions.id, suggestionId), eq(dreamSuggestions.podId, podId)))
    .limit(1);

  if (!s) {
    throw new Error(`Suggestion not found: ${suggestionId}`);
  }

  const proposal = s.proposal as Record<string, any>;

  // Execute proposal based on type
  if (s.type === "graph" && proposal.subject && proposal.predicate && proposal.object) {
    const subject = await createOrGetEntity(
      podId,
      proposal.subject.type || "concept",
      proposal.subject.name
    );
    const object = await createOrGetEntity(
      podId,
      proposal.object.type || "concept",
      proposal.object.name
    );
    const sourceEntryId = proposal.sourceEntryId || s.entryIds[0];

    if (sourceEntryId) {
      await createRelation(
        podId,
        subject.id,
        proposal.predicate,
        object.id,
        sourceEntryId,
        proposal.confidence ?? 1.0
      );
    }
  } else if (s.type === "merge" && proposal.mergedValue && s.entryIds.length >= 2) {
    // Update first entry with merged value
    await updateEntry({
      podId,
      entryId: s.entryIds[0],
      value: proposal.mergedValue,
      changedByUser: true,
    });
    // Delete subsequent merged entries
    for (let i = 1; i < s.entryIds.length; i++) {
      await deleteEntry(podId, s.entryIds[i], { actorType: "user" });
    }
  } else if (s.type === "promote" && s.entryIds[0]) {
    await updateEntry({
      podId,
      entryId: s.entryIds[0],
      kind: proposal.kind || "procedure",
      procedureWhen: proposal.procedureWhen || null,
      value: proposal.promotedValue || undefined,
      changedByUser: true,
    });
  }

  const [accepted] = await db
    .update(dreamSuggestions)
    .set({
      status: "accepted",
      decidedAt: new Date(),
    })
    .where(eq(dreamSuggestions.id, suggestionId))
    .returning();

  await logAuditEvent({
    podId,
    actorType: "user",
    action: "dream.accept",
    outcome: "ok",
    detail: { suggestionId, type: s.type, userId },
  });

  return accepted;
}

/**
 * Dismiss a suggestion without applying.
 */
export async function dismissSuggestion(
  podId: string,
  suggestionId: string,
  userId?: string
): Promise<DreamSuggestion> {
  const [dismissed] = await db
    .update(dreamSuggestions)
    .set({
      status: "dismissed",
      decidedAt: new Date(),
    })
    .where(and(eq(dreamSuggestions.id, suggestionId), eq(dreamSuggestions.podId, podId)))
    .returning();

  if (!dismissed) {
    throw new Error(`Suggestion not found: ${suggestionId}`);
  }

  await logAuditEvent({
    podId,
    actorType: "user",
    action: "dream.dismiss",
    outcome: "ok",
    detail: { suggestionId, userId },
  });

  return dismissed;
}
