"use client";

import { useState } from "react";
import { type Pod, type Agent, type Namespace } from "@/db/schema";
import { type AuditEventWithAgent } from "@/lib/memory/audit";

interface Props {
  pod: Pod;
  events: AuditEventWithAgent[];
  agents: Agent[];
  namespaces: Namespace[];
}

export function AuditWorkspace({ pod, events, agents, namespaces }: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("all");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  const filteredEvents = events.filter((ev) => {
    if (selectedAgentId !== "all" && ev.agentId !== selectedAgentId) return false;
    if (selectedAction !== "all" && ev.action !== selectedAction) return false;
    if (selectedOutcome !== "all" && ev.outcome !== selectedOutcome) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            Audit Trail
          </span>
          <span className="text-xs text-zinc-400">•</span>
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Pod: {pod.name}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Access & Activity Log
        </h1>
        <p className="text-xs text-zinc-500 max-w-xl">
          Complete, append-only history of every read, write, search, denial, and credential event across your memory pod.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-1.5 text-xs">
          <label className="text-zinc-500 font-medium">Actor / Agent:</label>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="all">All Actors</option>
            {agents.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name} ({ag.platform})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <label className="text-zinc-500 font-medium">Action:</label>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="all">All Actions</option>
            <option value="context">context (get_context)</option>
            <option value="search">search (search_memory)</option>
            <option value="read">read</option>
            <option value="list">list</option>
            <option value="write">write (create/update)</option>
            <option value="delete">delete</option>
            <option value="denied">denied (permission/scope)</option>
            <option value="rate_limited">rate_limited</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <label className="text-zinc-500 font-medium">Outcome:</label>
          <select
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value)}
            className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="all">All Outcomes</option>
            <option value="ok">ok</option>
            <option value="denied">denied</option>
            <option value="rate_limited">rate_limited</option>
            <option value="not_found">not_found</option>
            <option value="conflict">conflict</option>
          </select>
        </div>

        <span className="ml-auto text-xs text-zinc-400">
          Showing {filteredEvents.length} events
        </span>
      </div>

      {/* Events Table / Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <span className="text-2xl">📋</span>
          <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No audit events found
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Activity from agents and dashboard edits will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredEvents.map((ev) => (
            <div
              key={ev.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-white p-3.5 shadow-2xs transition-all dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Action Pill */}
                  <span
                    className={
                      "rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold uppercase " +
                      (ev.action === "write"
                        ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900"
                        : ev.action === "delete"
                        ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900"
                        : ev.action === "denied" || ev.action === "rate_limited"
                        ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900"
                        : "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700")
                    }
                  >
                    {ev.action}
                  </span>

                  {/* Actor */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-zinc-400">by</span>
                    <strong className="text-zinc-800 dark:text-zinc-200">
                      {ev.actorType === "user"
                        ? "You (Dashboard)"
                        : ev.agentName || "Agent"}
                    </strong>
                    {ev.agentPlatform && (
                      <span className="text-[10px] text-zinc-400 capitalize">
                        ({ev.agentPlatform})
                      </span>
                    )}
                  </div>

                  {/* Key or Path target */}
                  {(Boolean(ev.key) || Boolean(ev.namespacePath)) && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-zinc-400">•</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">
                        {ev.namespacePath ? `${ev.namespacePath}/` : null}
                        {ev.key ? <strong className="text-zinc-900 dark:text-zinc-100">{ev.key}</strong> : null}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Outcome pill */}
                  <span
                    className={
                      "rounded-full px-2 py-0.2 text-[10px] font-medium " +
                      (ev.outcome === "ok"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400")
                    }
                  >
                    {ev.outcome}
                  </span>

                  <span className="text-[11px] text-zinc-400">
                    {new Date(ev.createdAt).toLocaleTimeString()}
                  </span>

                  {Boolean(ev.detail) && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEventId(expandedEventId === ev.id ? null : ev.id)
                      }
                      className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      {expandedEventId === ev.id ? "▲" : "▼"}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Detail View */}
              {expandedEventId === ev.id && Boolean(ev.detail) && (
                <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 overflow-x-auto">
                  {JSON.stringify(ev.detail, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
