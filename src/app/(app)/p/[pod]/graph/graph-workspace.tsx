"use client";

import { useState, useTransition } from "react";
import type { Pod, KgEntity } from "@/db/schema";
import type { ExploredGraph } from "@/lib/memory/graph";
import { exploreGraphAction } from "./actions";

interface Props {
  pod: Pod;
  entities: KgEntity[];
  initialRelations: any[];
}

export function GraphWorkspace({ pod, entities, initialRelations }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGraph, setActiveGraph] = useState<ExploredGraph | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("all");

  const types = ["all", "person", "project", "tool", "concept", "org"];

  const filteredEntities =
    selectedType === "all"
      ? entities
      : entities.filter((e) => e.type.toLowerCase() === selectedType);

  async function handleExplore(name: string) {
    setSearchQuery(name);
    setIsSearching(true);
    try {
      const res = await exploreGraphAction(pod.slug, name, 1);
      if (res.graph) {
        setActiveGraph(res.graph);
      } else {
        setActiveGraph(null);
      }
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero Header */}
      <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-teal-50/50 via-sky-50/30 to-white p-6 shadow-sm dark:border-zinc-800 dark:from-teal-950/20 dark:via-sky-950/10 dark:to-zinc-950">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              Personal Knowledge Graph & Recursive Navigation
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Memory Knowledge Graph
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Explores entities, concepts, tools, and cross-folder relationships discovered by background consolidation and procedural memory. All relations are strictly scoped to source entry permissions.
          </p>
        </div>

        {/* Search Bar */}
        <div className="mt-5 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleExplore(searchQuery)}
            placeholder="Search entity (e.g. Next.js, Postgres, Alex)..."
            className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-2xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
          <button
            type="button"
            onClick={() => handleExplore(searchQuery)}
            disabled={isSearching || !searchQuery.trim()}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isSearching ? "Exploring…" : "Explore Graph"}
          </button>
        </div>

        {/* Quick Entity Suggestion Chips */}
        {entities.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Popular Entities:</span>
            {entities.slice(0, 8).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => handleExplore(e.name)}
                className="rounded-md border border-zinc-200 bg-white/80 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active Exploration Result */}
      {activeGraph && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-6 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-4 dark:border-indigo-900/40">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold">
                {activeGraph.rootEntity.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {activeGraph.rootEntity.name}
                  </h2>
                  <EntityTypeBadge type={activeGraph.rootEntity.type} />
                </div>
                {activeGraph.rootEntity.aliases && activeGraph.rootEntity.aliases.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Aliases: {activeGraph.rootEntity.aliases.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveGraph(null)}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Clear Exploration
            </button>
          </div>

          {/* Connected Entities */}
          {activeGraph.connectedEntities.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Connected Nodes (Click to traverse)
              </p>
              <div className="flex flex-wrap gap-2">
                {activeGraph.connectedEntities.map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => handleExplore(ent.name)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-2xs hover:border-indigo-400 hover:text-indigo-600 transition-all dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-indigo-500"
                  >
                    <span>{ent.name}</span>
                    <span className="text-[10px] text-zinc-400">({ent.type})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Traversed Relations */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Scoped Relations ({activeGraph.relations.length})
            </p>

            {activeGraph.relations.length === 0 ? (
              <p className="text-xs text-zinc-500">No relations logged for this node yet.</p>
            ) : (
              <div className="space-y-2">
                {activeGraph.relations.map((rel) => (
                  <div
                    key={rel.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2 font-mono text-xs text-zinc-800 dark:text-zinc-200 flex-wrap">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {rel.subjectName}
                      </span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        --[{rel.predicate}]--&gt;
                      </span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">
                        {rel.objectName}
                      </span>
                      <span className="text-[10px] font-sans text-zinc-400">
                        ({(rel.confidence * 100).toFixed(0)}% confidence)
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-400 shrink-0">
                      source:{" "}
                      <span className="font-mono text-zinc-600 dark:text-zinc-300">
                        [{rel.sourceNamespaceName}] {rel.sourceEntryKey}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* All Entities Section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Knowledge Graph Entities ({entities.length})
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Nodes extracted from your memory entries and files
            </p>
          </div>

          {/* Type filter */}
          <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-800">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={
                  "rounded-md px-2.5 py-1 text-xs capitalize transition-colors " +
                  (selectedType === t
                    ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {filteredEntities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              No entities found in this category. Run a dream cycle or explore an entity above!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {filteredEntities.map((ent) => (
              <div
                key={ent.id}
                onClick={() => handleExplore(ent.name)}
                className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs transition-all hover:border-indigo-400 hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                    {ent.name}
                  </h3>
                  <EntityTypeBadge type={ent.type} />
                </div>
                {ent.aliases && ent.aliases.length > 0 && (
                  <p className="mt-2 truncate text-xs text-zinc-400">
                    {ent.aliases.join(", ")}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Click to explore relations →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global Relations Table */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Graph Relations ({initialRelations.length})
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            All scoped relationships established between entities
          </p>
        </div>

        {initialRelations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              No relations established yet. Trigger a dream cycle to synthesize your memory entries into knowledge connections!
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Predicate</th>
                  <th className="px-4 py-3 font-medium">Object</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Source Entry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                {initialRelations.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">
                      {r.subject_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      [{r.predicate}]
                    </td>
                    <td className="px-4 py-3 font-semibold text-purple-600 dark:text-purple-400">
                      {r.object_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {(Number(r.confidence) * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      [{r.source_namespace_name}] {r.source_entry_key}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EntityTypeBadge({ type }: { type: string }) {
  const clean = type.toLowerCase();
  let color = "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";

  if (clean === "person") {
    color = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800";
  } else if (clean === "project") {
    color = "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800";
  } else if (clean === "tool") {
    color = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800";
  } else if (clean === "concept") {
    color = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
  } else if (clean === "org") {
    color = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800";
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${color}`}>
      {type}
    </span>
  );
}
