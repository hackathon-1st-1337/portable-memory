"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Pod, DreamRun, DreamSuggestion } from "@/db/schema";
import {
  triggerDreamCycleAction,
  acceptSuggestionAction,
  dismissSuggestionAction,
} from "./actions";

interface Props {
  pod: Pod;
  runs: DreamRun[];
  suggestions: DreamSuggestion[];
}

export function DreamWorkspace({ pod, runs, suggestions }: Props) {
  const router = useRouter();
  const [isDreaming, setIsDreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const acceptedSuggestions = suggestions.filter((s) => s.status === "accepted");

  async function handleTriggerDream() {
    setIsDreaming(true);
    setFeedbackMessage(null);
    try {
      const res = await triggerDreamCycleAction(pod.slug);
      if (res.error) {
        setFeedbackMessage(`Error: ${res.error}`);
      } else {
        const stats = res.stats as any;
        const count = stats?.suggestionsMade ?? 0;
        setFeedbackMessage(
          `Dream cycle completed! Scanned ${stats?.entriesScanned ?? 0} entries and generated ${count} suggestion${count === 1 ? "" : "s"}.`
        );
        router.refresh();
      }
    } finally {
      setIsDreaming(false);
    }
  }

  async function handleAccept(suggestionId: string) {
    setActionPendingId(suggestionId);
    try {
      const res = await acceptSuggestionAction(pod.slug, suggestionId);
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleDismiss(suggestionId: string) {
    setActionPendingId(suggestionId);
    try {
      const res = await dismissSuggestionAction(pod.slug, suggestionId);
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
    } finally {
      setActionPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-indigo-50/60 via-purple-50/40 to-white p-6 shadow-sm dark:border-zinc-800 dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-zinc-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Cloudflare Workers AI Consolidation
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Dreaming & Memory Synthesis
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Synthesizes disconnected memories into unified concepts, resolves contradictory preferences, discovers Knowledge Graph relations, and promotes episodic event patterns into long-term procedures.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTriggerDream}
            disabled={isDreaming}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:opacity-95 disabled:opacity-50 dark:from-indigo-500 dark:to-purple-500"
          >
            {isDreaming ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                <span>Dreaming in progress…</span>
              </>
            ) : (
              <>
                <span>✨ Trigger Dream Cycle</span>
              </>
            )}
          </button>
        </div>

        {feedbackMessage && (
          <div className="mt-4 rounded-lg bg-indigo-100/70 p-3 text-xs font-medium text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200">
            {feedbackMessage}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Cycles Run</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{runs.length}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Pending Suggestions</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {pendingSuggestions.length}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Accepted Improvements</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {acceptedSuggestions.length}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">AI Model</p>
          <p className="mt-1 truncate text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">
            llama-3.1-8b-instruct
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors " +
              (activeTab === "pending"
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300")
            }
          >
            Review Suggestions ({pendingSuggestions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors " +
              (activeTab === "history"
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300")
            }
          >
            Consolidation History ({runs.length})
          </button>
        </div>

        {/* Tab 1: Suggestions */}
        {activeTab === "pending" && (
          <div className="mt-6 flex flex-col gap-4">
            {pendingSuggestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center dark:border-zinc-800">
                <span className="text-3xl">✨</span>
                <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  No pending suggestions
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Your memory store is up to date. Run a dream cycle anytime to discover new knowledge links or consolidate recent entries.
                </p>
              </div>
            ) : (
              pendingSuggestions.map((suggestion) => {
                const proposal = (suggestion.proposal as any) || {};
                const isOperating = actionPendingId === suggestion.id;

                return (
                  <div
                    key={suggestion.id}
                    className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <SuggestionTypeBadge type={suggestion.type} />
                        <span className="text-xs text-zinc-400">
                          Discovered across {suggestion.entryIds.length} {suggestion.entryIds.length === 1 ? "entry" : "entries"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isOperating}
                          onClick={() => handleAccept(suggestion.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 dark:bg-emerald-500 dark:text-zinc-950"
                        >
                          Accept & Apply
                        </button>
                        <button
                          type="button"
                          disabled={isOperating}
                          onClick={() => handleDismiss(suggestion.id)}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {suggestion.rationale}
                      </p>
                    </div>

                    {/* Proposal Body Preview */}
                    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800/80 dark:bg-zinc-950/60">
                      {suggestion.type === "graph" && proposal.subject && proposal.object && (
                        <div className="flex items-center gap-2 font-mono text-zinc-800 dark:text-zinc-200">
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {proposal.subject.name}
                          </span>
                          <span className="text-zinc-400">--[{proposal.predicate}]--&gt;</span>
                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                            {proposal.object.name}
                          </span>
                        </div>
                      )}

                      {suggestion.type === "promote" && (
                        <div className="space-y-1.5">
                          {proposal.procedureWhen && (
                            <div className="text-purple-700 dark:text-purple-300 font-medium">
                              Trigger: When {proposal.procedureWhen}
                            </div>
                          )}
                          <div className="font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                            {proposal.promotedValue || JSON.stringify(proposal, null, 2)}
                          </div>
                        </div>
                      )}

                      {suggestion.type === "merge" && proposal.mergedValue && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                            Synthesized Content:
                          </span>
                          <div className="font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                            {typeof proposal.mergedValue === "string"
                              ? proposal.mergedValue
                              : JSON.stringify(proposal.mergedValue, null, 2)}
                          </div>
                        </div>
                      )}

                      {suggestion.type === "contradiction" && (
                        <div className="text-rose-700 dark:text-rose-300">
                          {proposal.resolution || "Review affected entries to align user preferences."}
                        </div>
                      )}

                      {suggestion.type === "stale" && (
                        <div className="text-amber-700 dark:text-amber-300">
                          {proposal.advice || "Information appears outdated based on more recent context."}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Run History */}
        {activeTab === "history" && (
          <div className="mt-6 flex flex-col gap-3">
            {runs.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">No dream runs logged yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Run ID</th>
                      <th className="px-4 py-3 font-medium">Started At</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Entries Scanned</th>
                      <th className="px-4 py-3 font-medium">Suggestions Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                    {runs.map((r) => {
                      const stats = (r.stats as any) || {};
                      const duration =
                        r.finishedAt && r.startedAt
                          ? `${Math.round(
                              new Date(r.finishedAt).getTime() -
                                new Date(r.startedAt).getTime()
                            )}ms`
                          : "—";

                      return (
                        <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {r.id.slice(0, 8)}…
                          </td>
                          <td className="px-4 py-3 text-zinc-500">
                            {new Date(r.startedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-zinc-500">{duration}</td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                "rounded-full px-2 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide " +
                                (r.status === "completed"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                                  : r.status === "failed"
                                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                                  : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400")
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {stats.entriesScanned ?? 0}
                          </td>
                          <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                            {stats.suggestionsMade ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionTypeBadge({ type }: { type: string }) {
  if (type === "merge") {
    return (
      <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800">
        Merge Conflict
      </span>
    );
  }
  if (type === "contradiction") {
    return (
      <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800">
        Contradiction
      </span>
    );
  }
  if (type === "promote") {
    return (
      <span className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">
        Promote to Procedure
      </span>
    );
  }
  if (type === "graph") {
    return (
      <span className="rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800">
        Graph Link
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
      {type}
    </span>
  );
}
