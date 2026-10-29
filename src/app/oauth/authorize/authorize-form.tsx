"use client";

import { useTransition } from "react";
import { authorizeOAuthClientAction, denyOAuthClientAction } from "./actions";
import type { Pod } from "@/db/schema";

interface AuthorizeFormProps {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  pods: Pod[];
  userName: string;
}

export function AuthorizeForm({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  pods,
  userName,
}: AuthorizeFormProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 font-semibold text-lg">
          {clientId.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {clientId}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Wants to access your Portable Memory as <span className="font-medium text-zinc-700 dark:text-zinc-300">{userName}</span>
          </p>
        </div>
      </div>

      <form action={authorizeOAuthClientAction} className="space-y-5">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
        <input type="hidden" name="state" value={state} />

        <div>
          <label
            htmlFor="pod_id"
            className="block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5"
          >
            Select Memory Pod to Connect
          </label>
          <select
            id="pod_id"
            name="pod_id"
            defaultValue={pods[0]?.id}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          >
            {pods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Requested Permissions
          </p>
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="permission_read"
                checked
                disabled
                className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                <strong className="block font-medium text-zinc-900 dark:text-zinc-100">Read memory entries</strong>
                Fetch pinned context, search entries, and traverse knowledge graph.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="permission_write"
                defaultChecked
                className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                <strong className="block font-medium text-zinc-900 dark:text-zinc-100">Write memory entries</strong>
                Save facts, events, and procedures (subject to folder approval settings).
              </span>
            </label>
          </div>
        </div>

        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Redirect URI: <span className="font-mono text-zinc-600 dark:text-zinc-400">{redirectUri}</span>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? "Connecting…" : "Authorize & Connect"}
          </button>
        </div>
      </form>

      <form action={denyOAuthClientAction} className="mt-3">
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="state" value={state} />
        <button
          type="submit"
          className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
