"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { type Pod, type Agent, type AgentToken } from "@/db/schema";
import { type AgentWithDetails } from "@/lib/agents/agents";
import { type Namespace } from "@/db/schema";
import {
  ALL_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from "@/lib/agents/permissions";
import {
  createAgentAction,
  updateAgentStatusAction,
  issueTokenAction,
  revokeTokenAction,
  fetchAgentDetailsAction,
  type AgentFormState,
} from "./actions";
import { buttonClass } from "@/components/ui/styles";
import { Field, SubmitButton, FormAlert } from "@/components/ui/form";

interface Props {
  pod: Pod;
  agents: AgentWithDetails[];
  namespaces: Namespace[];
}

export function AgentsWorkspace({ pod, agents, namespaces }: Props) {
  const router = useRouter();

  const [showConnect, setShowConnect] = useState(false);
  const [selectedAgentDetails, setSelectedAgentDetails] = useState<{
    agent: Agent;
    tokens: AgentToken[];
    scopes: { namespaceId: string; name: string; path: string }[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // One-time revealed token modal
  const [revealedToken, setRevealedToken] = useState<{
    rawToken: string;
    prefix: string;
    agentName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // New token label state for issuing inside detail
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [isIssuingToken, setIsIssuingToken] = useState(false);

  // Add agent form action
  const [createState, createAction, isCreating] = useActionState(
    async (prev: AgentFormState | null, fd: FormData) => {
      const res = await createAgentAction(pod.slug, prev, fd);
      if (res.createdToken) {
        setRevealedToken(res.createdToken);
        setShowConnect(false);
        router.refresh();
      }
      return res;
    },
    null
  );

  const [allNamespacesGrant, setAllNamespacesGrant] = useState(false);

  // Open details drawer
  async function handleOpenDetails(agent: Agent) {
    setLoadingDetails(true);
    const details = await fetchAgentDetailsAction(pod.slug, agent.id);
    setSelectedAgentDetails(details);
    setLoadingDetails(false);
  }

  // Toggle status
  async function handleToggleStatus(agent: Agent, newStatus: "active" | "paused" | "revoked") {
    await updateAgentStatusAction(pod.slug, agent.id, newStatus);
    router.refresh();
    if (selectedAgentDetails?.agent.id === agent.id) {
      const details = await fetchAgentDetailsAction(pod.slug, agent.id);
      setSelectedAgentDetails(details);
    }
  }

  // Issue new token
  async function handleIssueToken(agentId: string) {
    setIsIssuingToken(true);
    const res = await issueTokenAction(pod.slug, agentId, newTokenLabel);
    setIsIssuingToken(false);
    setNewTokenLabel("");
    if (res.rawToken && res.prefix) {
      setRevealedToken({
        rawToken: res.rawToken,
        prefix: res.prefix,
        agentName: selectedAgentDetails?.agent.name || "Agent",
      });
      const details = await fetchAgentDetailsAction(pod.slug, agentId);
      setSelectedAgentDetails(details);
      router.refresh();
    }
  }

  // Revoke token
  async function handleRevokeToken(agentId: string, tokenId: string) {
    await revokeTokenAction(pod.slug, agentId, tokenId);
    const details = await fetchAgentDetailsAction(pod.slug, agentId);
    setSelectedAgentDetails(details);
    router.refresh();
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              Connections
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Pod: {pod.name}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Connected AI Agents
          </h1>
          <p className="mt-1 text-xs text-zinc-500 max-w-xl">
            Authorize Claude, ChatGPT, Cursor, or custom AI agents to read and write your memory.
            Permissions and folder grants apply instantly to all of the agent&apos;s credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowConnect(true)}
          className={buttonClass("primary")}
        >
          ＋ Connect Agent
        </button>
      </div>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <span className="text-3xl">🤖</span>
          <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No agents connected
          </h3>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            Connect an agent to generate a scoped bearer token or MCP server endpoint.
          </p>
          <button
            type="button"
            onClick={() => setShowConnect(true)}
            className={buttonClass("primary", "mt-4 text-xs py-1.5 px-3")}
          >
            ＋ Connect First Agent
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-2xs transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-100 text-base dark:bg-zinc-800">
                      {agent.platform === "claude"
                        ? "🟠"
                        : agent.platform === "chatgpt"
                        ? "🟢"
                        : agent.platform === "cursor"
                        ? "🟣"
                        : "🤖"}
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-zinc-500 capitalize">
                        Platform: {agent.platform}
                      </p>
                    </div>
                  </div>

                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium capitalize " +
                      (agent.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800"
                        : agent.status === "paused"
                        ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800"
                        : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800")
                    }
                  >
                    {agent.status}
                  </span>
                </div>

                {agent.description && (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {agent.description}
                  </p>
                )}

                {/* Scope & Permissions Pills */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {agent.allNamespaces
                      ? "🌐 Whole Pod (All Folders)"
                      : `📁 ${agent.grantedFolderCount} folder(s)`}
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {agent.permissions.length} permissions
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {agent.rateLimitPerMin} req/min
                  </span>
                </div>

                <div className="mt-3 text-[11px] text-zinc-400">
                  {agent.lastSeenAt
                    ? `Last active ${new Date(agent.lastSeenAt).toLocaleString()}`
                    : "Never connected yet"}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  {agent.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(agent, "paused")}
                      className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 underline underline-offset-4"
                    >
                      Pause
                    </button>
                  ) : agent.status === "paused" ? (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(agent, "active")}
                      className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 underline underline-offset-4"
                    >
                      Resume
                    </button>
                  ) : null}

                  {agent.status !== "revoked" && (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(agent, "revoked")}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 underline underline-offset-4"
                    >
                      Revoke Access
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenDetails(agent)}
                  className={buttonClass("secondary", "text-xs py-1 px-2.5")}
                >
                  Manage Tokens ({agent.activeTokenCount}) →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONNECT AGENT MODAL */}
      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Connect a New AI Agent
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Create an agent identity, choose its allowed folders, and issue its first token.
            </p>

            <form action={createAction} className="mt-4 flex flex-col gap-4">
              <FormAlert state={createState} />

              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Agent Name"
                  name="name"
                  placeholder="e.g. Claude Work Assistant"
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Platform
                  </label>
                  <select
                    name="platform"
                    defaultValue="claude"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="chatgpt">ChatGPT (OpenAI)</option>
                    <option value="cursor">Cursor / VS Code</option>
                    <option value="custom">Custom Agent / Script</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <Field
                label="Description (optional)"
                name="description"
                placeholder="What this agent is used for..."
              />

              {/* Permissions */}
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Access Permissions
                </span>
                <div className="flex flex-col gap-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <label key={perm} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={perm}
                        defaultChecked={perm === "memory:read" || perm === "memory:write" || perm === "memory:list"}
                        className="mt-0.5 size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                      />
                      <div>
                        <span className="font-mono font-medium">{perm}</span>
                        <p className="text-[11px] text-zinc-500">
                          {PERMISSION_DESCRIPTIONS[perm]}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Scope Selection */}
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Folder Scope Grants
                </span>

                <label className="flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-200 font-medium">
                  <input
                    type="checkbox"
                    name="allNamespaces"
                    value="true"
                    checked={allNamespacesGrant}
                    onChange={(e) => setAllNamespacesGrant(e.target.checked)}
                    className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                  />
                  <span>Grant entire pod tree (including all future folders)</span>
                </label>

                {!allNamespacesGrant && (
                  <div className="mt-2 flex flex-col gap-1 max-h-40 overflow-y-auto pl-2 border-l-2 border-zinc-200 dark:border-zinc-800">
                    <span className="text-[11px] text-zinc-500 mb-1">
                      Choose folders to grant (grants cover the folder and its entire subtree):
                    </span>
                    {namespaces.map((ns) => (
                      <label key={ns.id} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          name="folderIds"
                          value={ns.id}
                          className="size-3.5 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                        />
                        <span>{"— ".repeat(ns.depth - 1)} {ns.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowConnect(false)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Connecting...">Connect Agent & Issue Token</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-TIME SECRET TOKEN REVEAL MODAL */}
      {revealedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-xl border border-emerald-300 bg-white p-6 shadow-2xl dark:border-emerald-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                ✓
              </span>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Agent Token Generated for {revealedToken.agentName}
              </h2>
            </div>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
              <strong>⚠️ Copy this token now.</strong> For your security, this raw bearer token is never stored in plain text and cannot be retrieved again.
            </div>

            {/* Token Copy Box */}
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Bearer Token (Key Prefix: {revealedToken.prefix}...)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={revealedToken.rawToken}
                  className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 select-all dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(revealedToken.rawToken)}
                  className={buttonClass("primary", "text-xs py-2 px-4")}
                >
                  {copied ? "Copied!" : "Copy Token"}
                </button>
              </div>
            </div>

            {/* Quick Setup Snippets */}
            <div className="mt-6 flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                How to Connect Your Agent:
              </span>

              {/* Claude Code CLI */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Claude Code (CLI)
                </span>
                <pre className="rounded bg-zinc-100 p-2 font-mono text-[11px] text-zinc-800 overflow-x-auto dark:bg-zinc-950 dark:text-zinc-200">
                  claude mcp add --transport http portable-memory {typeof window !== "undefined" ? window.location.origin : ""}/api/mcp --header &quot;Authorization: Bearer {revealedToken.rawToken}&quot;
                </pre>
              </div>

              {/* Claude Desktop Config */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Claude Desktop (`claude_desktop_config.json`)
                </span>
                <pre className="rounded bg-zinc-100 p-2 font-mono text-[10px] text-zinc-800 overflow-x-auto dark:bg-zinc-950 dark:text-zinc-200">
{`{
  "mcpServers": {
    "portable-memory": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote-client",
        "${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp",
        "--header",
        "Authorization: Bearer ${revealedToken.rawToken}"
      ]
    }
  }
}`}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setRevealedToken(null)}
                className={buttonClass("primary")}
              >
                I Have Saved My Token
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AGENT DETAILS & TOKENS DRAWER */}
      {selectedAgentDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedAgentDetails.agent.name}
                </h2>
                <p className="text-xs text-zinc-500">
                  Agent ID: {selectedAgentDetails.agent.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgentDetails(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto flex flex-col gap-5 pr-1">
              {/* Permissions & Scopes Summary */}
              <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Granted Folders:
                </span>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {selectedAgentDetails.agent.allNamespaces
                    ? "Whole Pod (all namespaces and future folders)"
                    : selectedAgentDetails.scopes.map((s) => s.name).join(", ") || "No specific folders granted"}
                </p>

                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-2">
                  Permissions:
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedAgentDetails.agent.permissions.map((p) => (
                    <span key={p} className="rounded bg-zinc-200/60 px-2 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tokens Management */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Agent Tokens ({selectedAgentDetails.tokens.length})
                  </h3>
                </div>

                {/* Issue New Token Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    placeholder="Label (e.g. laptop or staging)"
                    className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleIssueToken(selectedAgentDetails.agent.id)}
                    disabled={isIssuingToken}
                    className={buttonClass("secondary", "text-xs py-1.5 px-3")}
                  >
                    {isIssuingToken ? "Issuing..." : "＋ Issue New Token"}
                  </button>
                </div>

                {/* Tokens List */}
                <div className="flex flex-col gap-2">
                  {selectedAgentDetails.tokens.map((tok) => (
                    <div
                      key={tok.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {tok.prefix}...
                          </span>
                          {tok.label && (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {tok.label}
                            </span>
                          )}
                          {tok.revokedAt ? (
                            <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                              Revoked
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          Created {new Date(tok.createdAt).toLocaleDateString()}
                          {tok.lastUsedAt && ` • Last used ${new Date(tok.lastUsedAt).toLocaleString()}`}
                        </span>
                      </div>

                      {!tok.revokedAt && (
                        <button
                          type="button"
                          onClick={() => handleRevokeToken(selectedAgentDetails.agent.id, tok.id)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60 font-medium"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAgentDetails(null)}
                className={buttonClass("secondary")}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
