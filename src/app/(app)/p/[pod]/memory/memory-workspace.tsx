"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  type NamespaceWithCounts,
} from "@/lib/memory/namespaces";
import {
  type EntryWithNamespace,
} from "@/lib/memory/entries";
import { type Agent, type Pod, type MemoryEntryVersion } from "@/db/schema";
import {
  createNamespaceAction,
  updateNamespaceAction,
  moveNamespaceAction,
  deleteNamespaceAction,
  createEntryAction,
  updateEntryAction,
  togglePinAction,
  toggleVisibilityAction,
  deleteEntryAction,
  fetchEntryVersionsAction,
  restoreEntryVersionAction,
  searchMemoryAction,
  approveDraftAction,
  rejectDraftAction,
  toggleFolderRequireApprovalAction,
  type MemoryFormState,
} from "./actions";
import { buttonClass } from "@/components/ui/styles";
import { Field, SubmitButton, FormAlert } from "@/components/ui/form";
import type { SearchResult } from "@/lib/memory/search";
import type { PendingDraftItem } from "@/lib/memory/procedures";

interface Props {
  pod: Pod;
  namespaces: NamespaceWithCounts[];
  entries: EntryWithNamespace[];
  agents: Agent[];
  pendingDrafts?: PendingDraftItem[];
  activeNamespaceId?: string;
}

export function MemoryWorkspace({
  pod,
  namespaces,
  entries,
  agents,
  pendingDrafts = [],
  activeNamespaceId: initialActiveId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active folder selection (null = show all)
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<string | null>(
    initialActiveId ?? null
  );

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "pinned" | "shared" | "private">("all");

  // Modals state
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NamespaceWithCounts | null>(null);
  const [movingFolder, setMovingFolder] = useState<NamespaceWithCounts | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<NamespaceWithCounts | null>(null);

  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EntryWithNamespace | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<EntryWithNamespace | null>(null);
  const [historyEntry, setHistoryEntry] = useState<EntryWithNamespace | null>(null);
  const [entryVersions, setEntryVersions] = useState<MemoryEntryVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Form states
  const [createFolderState, createFolderAction] = useActionState(
    (prev: MemoryFormState | null, fd: FormData) =>
      createNamespaceAction(pod.slug, prev, fd),
    null
  );

  const [createEntryState, createEntryActionHandler] = useActionState(
    (prev: MemoryFormState | null, fd: FormData) =>
      createEntryAction(pod.slug, prev, fd),
    null
  );

  // Selected folder object
  const activeFolder = namespaces.find((n) => n.id === selectedNamespaceId);

  // Filtered entries
  let displayedEntries = entries;
  if (selectedNamespaceId) {
    displayedEntries = displayedEntries.filter(
      (e) => e.namespaceId === selectedNamespaceId
    );
  }
  if (filterMode === "pinned") {
    displayedEntries = displayedEntries.filter((e) => e.pinned);
  } else if (filterMode === "shared") {
    displayedEntries = displayedEntries.filter((e) => e.visibility === "shared");
  } else if (filterMode === "private") {
    displayedEntries = displayedEntries.filter((e) => e.visibility === "private");
  }

  // Handle Search
  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchMemoryAction(pod.slug, q);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  }

  // Handle pin toggle
  async function handleTogglePin(entry: EntryWithNamespace) {
    await togglePinAction(pod.slug, entry.id, entry.pinned);
    router.refresh();
  }

  // Handle visibility toggle
  async function handleToggleVisibility(entry: EntryWithNamespace) {
    const next = entry.visibility === "shared" ? "private" : "shared";
    await toggleVisibilityAction(pod.slug, entry.id, next);
    router.refresh();
  }

  // View version history
  async function handleViewHistory(entry: EntryWithNamespace) {
    setHistoryEntry(entry);
    setLoadingVersions(true);
    const versions = await fetchEntryVersionsAction(pod.slug, entry.id);
    setEntryVersions(versions);
    setLoadingVersions(false);
  }

  // Restore version
  async function handleRestoreVersion(version: number) {
    if (!historyEntry) return;
    await restoreEntryVersionAction(pod.slug, historyEntry.id, version);
    setHistoryEntry(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              Memory Store
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Pod: {pod.name}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Memory & Knowledge Folders
          </h1>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search memory entries..."
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 pl-8 text-xs text-zinc-900 shadow-2xs placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:ring-zinc-100"
          />
          <svg
            className="absolute left-2.5 top-2 size-3.5 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {isSearching && (
            <span className="absolute right-2.5 top-2 text-[10px] text-zinc-400 animate-pulse">
              Searching...
            </span>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-12">
        {/* Left Sidebar: Folder Tree (4 cols) */}
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950 md:col-span-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Folders ({namespaces.length})
            </span>
            <button
              type="button"
              onClick={() => setShowCreateFolder(true)}
              className="rounded px-2 py-0.5 text-xs font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              ＋ New Folder
            </button>
          </div>

          {/* All Entries Button */}
          <button
            type="button"
            onClick={() => setSelectedNamespaceId(null)}
            className={
              "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors " +
              (selectedNamespaceId === null
                ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900")
            }
          >
            <span className="flex items-center gap-2">
              <span>📚</span>
              <span>All Folders</span>
            </span>
            <span className="text-[10px] opacity-75">{entries.length} entries</span>
          </button>

          {/* Folder List with depths */}
          <div className="flex flex-col gap-0.5">
            {namespaces.map((ns) => {
              const isSelected = selectedNamespaceId === ns.id;
              const indent = (ns.depth - 1) * 14;

              return (
                <div
                  key={ns.id}
                  style={{ paddingLeft: `${indent}px` }}
                  className={
                    "group flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors " +
                    (isSelected
                      ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setSelectedNamespaceId(ns.id)}
                    className="flex flex-1 items-center gap-2 truncate text-left"
                  >
                    <span>{ns.defaultVisibility === "private" ? "🔒" : "📁"}</span>
                    <span className="truncate">{ns.name}</span>
                    {ns.entryCount > 0 && (
                      <span className="rounded-full bg-zinc-200/60 px-1.5 py-0.2 text-[10px] text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-400">
                        {ns.entryCount}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="Folder Settings"
                      onClick={() => setEditingFolder(ns)}
                      className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      ⚙️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Connected Agents for Active Folder */}
          {activeFolder && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Folder Access
              </span>
              <p className="mt-1 text-xs text-zinc-500">
                Visibility:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {activeFolder.defaultVisibility}
                </span>{" "}
                • Agents can create:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {activeFolder.agentsCanCreate ? "Yes" : "No (Updates only)"}
                </span>
              </p>
              {activeFolder.description && (
                <p className="mt-2 text-xs italic text-zinc-500 dark:text-zinc-400">
                  &ldquo;{activeFolder.description}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Content Area: Entries List & Search Results (8 cols) */}
        <div className="flex flex-col gap-4 md:col-span-8">
          {/* Header Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeFolder ? activeFolder.name : "All Entries"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {displayedEntries.length} items
                </span>
                {activeFolder?.requireApproval && (
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                    Approval Gate Active
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                {activeFolder
                  ? `Entries stored under /${activeFolder.name}`
                  : "Viewing entries across all memory namespaces"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Filter Pills */}
              <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-800">
                {(["all", "pinned", "shared", "private"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFilterMode(m)}
                    className={
                      "rounded-md px-2 py-1 text-xs capitalize transition-colors " +
                      (filterMode === m
                        ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowCreateEntry(true)}
                className={buttonClass("primary", "text-xs py-1.5 px-3")}
              >
                ＋ New Entry
              </button>
            </div>
          </div>

          {/* Review Queue (Drafts awaiting user approval) */}
          {pendingDrafts.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200/80 dark:border-amber-900/40">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                    Review Queue ({pendingDrafts.length} pending agent {pendingDrafts.length === 1 ? "draft" : "drafts"})
                  </span>
                </div>
                <span className="text-[11px] text-amber-700 dark:text-amber-300">
                  Hold for human review before entering live memory
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2.5">
                {pendingDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 shadow-2xs dark:border-amber-900/40 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          {draft.key}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                          in {draft.namespaceName}
                        </span>
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800 uppercase tracking-wide">
                          {draft.kind}
                        </span>
                        {draft.procedureWhen && (
                          <span className="text-xs text-purple-600 dark:text-purple-400 italic">
                            Trigger: When {draft.procedureWhen}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await approveDraftAction(pod.slug, draft.id);
                            router.refresh();
                          }}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors dark:bg-emerald-500 dark:text-zinc-950"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await rejectDraftAction(pod.slug, draft.id);
                            router.refresh();
                          }}
                          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    <div className="rounded bg-zinc-50 p-2 font-mono text-xs text-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-200 whitespace-pre-wrap break-words">
                      {draft.valueText}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Results Alert (if search query active) */}
          {searchResults !== null && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Search Results for &ldquo;{searchQuery}&rdquo; ({searchResults.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Clear Search
                </button>
              </div>

              {searchResults.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">No matching entries found.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {searchResults.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start justify-between rounded-lg border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            [{r.namespaceName}] {r.key}
                          </span>
                          {r.pinned && (
                            <span className="text-amber-500 text-xs">★ Pinned</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                          {r.valueText}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">
                        score: {r.rank.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Entries Cards List */}
          {displayedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
              <span className="text-2xl">🧠</span>
              <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No memory entries
              </h3>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">
                {activeFolder
                  ? `There are no entries in '${activeFolder.name}' yet.`
                  : "Your memory pod is empty. Create your first entry or let an authorized agent write into it."}
              </p>
              <button
                type="button"
                onClick={() => setShowCreateEntry(true)}
                className={buttonClass("primary", "mt-4 text-xs py-1.5 px-3")}
              >
                ＋ Add Entry
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                        {entry.key}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        in {entry.namespaceName}
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.2 text-[10px] font-medium " +
                          (entry.visibility === "shared"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800"
                            : "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700")
                        }
                      >
                        {entry.visibility}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        v{entry.version}
                      </span>
                      {entry.kind && entry.kind !== "fact" && (
                        <span
                          className={
                            "rounded-full px-2 py-0.2 text-[10px] font-medium uppercase tracking-wider " +
                            (entry.kind === "procedure"
                              ? "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800"
                              : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800")
                          }
                        >
                          {entry.kind}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Pin button */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(entry)}
                        title={entry.pinned ? "Unpin entry" : "Pin entry"}
                        className={
                          "rounded p-1 text-xs transition-colors " +
                          (entry.pinned
                            ? "text-amber-500 bg-amber-50 dark:bg-amber-950/60"
                            : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200")
                        }
                      >
                        ★
                      </button>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => setEditingEntry(entry)}
                        className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>

                      {/* History button */}
                      <button
                        type="button"
                        onClick={() => handleViewHistory(entry)}
                        className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        History
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => setDeletingEntry(entry)}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {entry.kind === "procedure" && entry.procedureWhen && (
                    <div className="mt-2.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50/80 dark:bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-200/70 dark:border-purple-900/50 flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-[10px] text-purple-900 dark:text-purple-200">Trigger</span>
                      <span>When: {entry.procedureWhen}</span>
                    </div>
                  )}

                  {/* Entry Value Box */}
                  <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs dark:border-zinc-800/80 dark:bg-zinc-900/60 font-mono overflow-x-auto whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-200">
                    {typeof entry.value === "string"
                      ? entry.value
                      : JSON.stringify(entry.value, null, 2)}
                  </div>

                  {/* Metadata Footer */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                    <div>
                      {entry.createdByUser ? (
                        <span>Written by you</span>
                      ) : (
                        <span>
                          Written by{" "}
                          <strong className="text-zinc-600 dark:text-zinc-300">
                            {entry.sourceAgentName || "Agent"}
                          </strong>
                        </span>
                      )}
                    </div>
                    <span>Updated {new Date(entry.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CREATE FOLDER MODAL */}
      {showCreateFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Create New Folder
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Folders organize your memory hierarchy (up to 3 levels deep).
            </p>

            <form
              action={async (fd) => {
                const res = await createNamespaceAction(pod.slug, null, fd);
                if (!res.error) {
                  setShowCreateFolder(false);
                  router.refresh();
                }
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <Field
                label="Folder Name"
                name="name"
                placeholder="e.g. travel or work-goals"
                hint="Lowercase letters, numbers, and hyphens"
                required
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Parent Folder (optional)
                </label>
                <select
                  name="parentId"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">(None - Root level)</option>
                  {namespaces
                    .filter((n) => n.depth < 3)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {"— ".repeat(n.depth - 1)} {n.name}
                      </option>
                    ))}
                </select>
              </div>

              <Field
                label="Description"
                name="description"
                placeholder="What belongs in this folder (shown to agents)"
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Default Visibility
                </label>
                <select
                  name="defaultVisibility"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="shared">Shared (accessible to granted agents)</option>
                  <option value="private">Private (dashboard only)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="agentsCanCreate"
                  name="agentsCanCreate"
                  value="true"
                  defaultChecked
                  className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                />
                <label
                  htmlFor="agentsCanCreate"
                  className="text-xs text-zinc-700 dark:text-zinc-300"
                >
                  Agents can create new entries here (uncheck to restrict agents to updates only)
                </label>
              </div>

              {agents.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Grant initial access to agents:
                  </span>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {agents.map((ag) => (
                      <label key={ag.id} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          name="grantAgentIds"
                          value={ag.id}
                          className="size-3.5 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                        />
                        <span>{ag.name} ({ag.platform})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(false)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Creating...">Create Folder</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FOLDER MODAL */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Folder Settings: {editingFolder.name}
            </h2>

            <form
              action={async (fd) => {
                const res = await updateNamespaceAction(
                  pod.slug,
                  editingFolder.id,
                  null,
                  fd
                );
                if (!res.error) {
                  setEditingFolder(null);
                  router.refresh();
                }
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <Field
                label="Folder Name"
                name="name"
                defaultValue={editingFolder.name}
                required
              />

              <Field
                label="Description"
                name="description"
                defaultValue={editingFolder.description || ""}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Default Visibility
                </label>
                <select
                  name="defaultVisibility"
                  defaultValue={editingFolder.defaultVisibility}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="shared">Shared</option>
                  <option value="private">Private</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editAgentsCanCreate"
                  name="agentsCanCreate"
                  value="true"
                  defaultChecked={editingFolder.agentsCanCreate}
                  className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                />
                <label
                  htmlFor="editAgentsCanCreate"
                  className="text-xs text-zinc-700 dark:text-zinc-300"
                >
                  Agents can create new keys
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editRequireApproval"
                  name="requireApproval"
                  value="true"
                  defaultChecked={editingFolder.requireApproval}
                  className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                />
                <label
                  htmlFor="editRequireApproval"
                  className="text-xs text-zinc-700 dark:text-zinc-300"
                >
                  Require human approval for agent writes (draft review queue)
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMovingFolder(editingFolder);
                      setEditingFolder(null);
                    }}
                    className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 underline underline-offset-4"
                  >
                    Move Folder...
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingFolder(editingFolder);
                      setEditingFolder(null);
                    }}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 underline underline-offset-4"
                  >
                    Delete Folder
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingFolder(null)}
                    className={buttonClass("secondary")}
                  >
                    Cancel
                  </button>
                  <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MOVE FOLDER MODAL */}
      {movingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Move Folder: {movingFolder.name}
            </h2>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Moving a folder changes the inheritance of agent access scopes for it and its subfolders.
            </p>

            <form
              action={async (fd) => {
                const targetId = fd.get("targetParentId")?.toString() || null;
                const res = await moveNamespaceAction(
                  pod.slug,
                  movingFolder.id,
                  targetId
                );
                if (!res.error) {
                  setMovingFolder(null);
                  router.refresh();
                }
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Select New Parent Location
                </label>
                <select
                  name="targetParentId"
                  defaultValue={movingFolder.parentId || ""}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">(Move to Root Level)</option>
                  {namespaces
                    .filter((n) => n.id !== movingFolder.id && n.depth < 3)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {"— ".repeat(n.depth - 1)} {n.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setMovingFolder(null)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Moving...">Confirm Move</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE FOLDER MODAL */}
      {deletingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/60 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-red-600 dark:text-red-400">
              Delete Folder: {deletingFolder.name}
            </h2>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              This folder currently contains {deletingFolder.entryCount} memory entries.
            </p>

            <form
              action={async (fd) => {
                const moveTarget = fd.get("moveEntriesTo")?.toString() || null;
                await deleteNamespaceAction(
                  pod.slug,
                  deletingFolder.id,
                  moveTarget
                );
                setDeletingFolder(null);
                setSelectedNamespaceId(null);
                router.refresh();
              }}
              className="mt-4 flex flex-col gap-4"
            >
              {deletingFolder.entryCount > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    What should happen to existing entries?
                  </label>
                  <select
                    name="moveEntriesTo"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">Soft-delete entries together with folder</option>
                    {namespaces
                      .filter((n) => n.id !== deletingFolder.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          Move entries to: {n.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDeletingFolder(null)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <button type="submit" className={buttonClass("danger")}>
                  Delete Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ENTRY MODAL */}
      {showCreateEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Create Memory Entry
            </h2>

            <form
              action={async (fd) => {
                const res = await createEntryAction(pod.slug, null, fd);
                if (!res.error) {
                  setShowCreateEntry(false);
                  router.refresh();
                }
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Target Folder
                </label>
                <select
                  name="namespaceId"
                  defaultValue={selectedNamespaceId || namespaces[0]?.id}
                  required
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {namespaces.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.defaultVisibility})
                    </option>
                  ))}
                </select>
              </div>

              <Field
                label="Key"
                name="key"
                placeholder="e.g. editor.theme or tone"
                hint="Lowercase letters, numbers, dots, hyphens, underscores"
                required
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Value (plain text or JSON)
                </label>
                <textarea
                  name="value"
                  rows={4}
                  placeholder="Enter memory content or JSON..."
                  required
                  className="rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Kind
                  </label>
                  <select
                    name="kind"
                    defaultValue="fact"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="fact">Fact</option>
                    <option value="event">Event</option>
                    <option value="procedure">Procedure</option>
                  </select>
                </div>

                <Field
                  label="Trigger Condition (if procedure)"
                  name="procedureWhen"
                  placeholder="e.g. When deploying to production"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Visibility
                  </label>
                  <select
                    name="visibility"
                    defaultValue="shared"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="shared">Shared (accessible to agents)</option>
                    <option value="private">Private (dashboard only)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="entryPinned"
                    name="pinned"
                    value="true"
                    className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                  />
                  <label
                    htmlFor="entryPinned"
                    className="text-xs text-zinc-700 dark:text-zinc-300"
                  >
                    Pin entry (loaded in initial agent context)
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateEntry(false)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Saving...">Save Entry</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ENTRY MODAL */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Edit Entry: {editingEntry.key} (v{editingEntry.version})
            </h2>

            <form
              action={async (fd) => {
                const res = await updateEntryAction(
                  pod.slug,
                  editingEntry.id,
                  editingEntry.version,
                  null,
                  fd
                );
                if (!res.error) {
                  setEditingEntry(null);
                  router.refresh();
                }
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Value (plain text or JSON)
                </label>
                <textarea
                  name="value"
                  rows={5}
                  defaultValue={
                    typeof editingEntry.value === "string"
                      ? editingEntry.value
                      : JSON.stringify(editingEntry.value, null, 2)
                  }
                  required
                  className="rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Kind
                  </label>
                  <select
                    name="kind"
                    defaultValue={editingEntry.kind || "fact"}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="fact">Fact</option>
                    <option value="event">Event</option>
                    <option value="procedure">Procedure</option>
                  </select>
                </div>

                <Field
                  label="Trigger Condition (if procedure)"
                  name="procedureWhen"
                  defaultValue={editingEntry.procedureWhen || ""}
                  placeholder="e.g. When deploying to production"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Visibility
                  </label>
                  <select
                    name="visibility"
                    defaultValue={editingEntry.visibility}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="shared">Shared</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="editEntryPinned"
                    name="pinned"
                    value="true"
                    defaultChecked={editingEntry.pinned}
                    className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                  />
                  <label
                    htmlFor="editEntryPinned"
                    className="text-xs text-zinc-700 dark:text-zinc-300"
                  >
                    Pinned to get_context
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Updating...">Update Entry</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERSION HISTORY MODAL */}
      {historyEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Version History: {historyEntry.key}
                </h2>
                <p className="text-xs text-zinc-500">
                  Every update and agent write creates an immutable historical version snapshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryEntry(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
              {loadingVersions ? (
                <p className="text-xs text-zinc-400 animate-pulse">Loading version history...</p>
              ) : entryVersions.length === 0 ? (
                <p className="text-xs text-zinc-400">No previous versions recorded.</p>
              ) : (
                entryVersions.map((ver) => (
                  <div
                    key={ver.version}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          v{ver.version}
                        </span>
                        <span className="rounded bg-zinc-200/60 px-1.5 py-0.2 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 uppercase">
                          {ver.change}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {ver.changedByUser ? "by User" : "by Agent"} •{" "}
                          {new Date(ver.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {ver.version !== historyEntry.version && (
                        <button
                          type="button"
                          onClick={() => handleRestoreVersion(ver.version)}
                          className="rounded px-2 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/60 font-medium"
                        >
                          Restore
                        </button>
                      )}
                    </div>

                    <div className="rounded bg-white p-2 font-mono text-[11px] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 whitespace-pre-wrap break-words border border-zinc-100 dark:border-zinc-800">
                      {ver.valueText}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryEntry(null)}
                className={buttonClass("secondary")}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ENTRY CONFIRMATION */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/60 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-red-600 dark:text-red-400">
              Delete Entry: {deletingEntry.key}
            </h2>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              Are you sure you want to delete this memory entry? It will be soft-deleted and preserved in history.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className={buttonClass("secondary")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteEntryAction(pod.slug, deletingEntry.id);
                  setDeletingEntry(null);
                  router.refresh();
                }}
                className={buttonClass("danger")}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
