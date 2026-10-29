"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Pod } from "@/db/schema";
import {
  createPodAction,
  updatePodAction,
  setDefaultPodAction,
  deletePodAction,
} from "./actions";
import { buttonClass } from "@/components/ui/styles";
import { Field, SubmitButton, FormAlert, Alert } from "@/components/ui/form";

export function PodsManager({ initialPods }: { initialPods: Pod[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPod, setEditingPod] = useState<Pod | null>(null);
  const [deletingPod, setDeletingPod] = useState<Pod | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [createState, createAction, isCreating] = useActionState(
    createPodAction,
    null
  );

  async function handleSetDefault(podId: string) {
    await setDefaultPodAction(podId);
    router.refresh();
  }

  async function handleDelete() {
    if (!deletingPod) return;
    setIsDeleting(true);
    setDeleteError(null);

    const res = await deletePodAction(
      deletingPod.id,
      deleteInput,
      deletingPod.slug
    );

    setIsDeleting(false);
    if (res?.error) {
      setDeleteError(res.error);
    } else {
      setDeletingPod(null);
      setDeleteInput("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Memory Pods
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Each pod is an isolated memory boundary. Agents connected to one pod
            cannot see or access another.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className={buttonClass("primary")}
        >
          {showCreate ? "Cancel" : "＋ New Pod"}
        </button>
      </div>

      {/* Create Pod Form Drawer / Accordion */}
      {showCreate && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Create a New Memory Pod
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Pods come pre-seeded with default folders (identity, preferences, projects, work, health, notes).
          </p>

          <form action={createAction} className="mt-6 flex flex-col gap-4">
            <FormAlert state={createState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Pod Name"
                name="name"
                placeholder="e.g. Work or Freelance"
                required
              />
              <Field
                label="Slug (URL identifier)"
                name="slug"
                placeholder="e.g. work"
                hint="Lowercase letters, numbers, and hyphens"
                required
              />
            </div>

            <Field
              label="Description (optional)"
              name="description"
              placeholder="What this pod is for..."
            />

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="allowEmbeddings"
                name="allowEmbeddings"
                value="true"
                className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <label
                htmlFor="allowEmbeddings"
                className="text-xs text-zinc-700 dark:text-zinc-300"
              >
                Allow semantic embeddings (vector search) for entries in this pod
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className={buttonClass("secondary")}
              >
                Cancel
              </button>
              <SubmitButton pendingLabel="Creating Pod...">Create Pod</SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* Pods Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {initialPods.map((pod) => (
          <div
            key={pod.id}
            className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-6 shadow-2xs transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {pod.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {pod.name}
                    </h3>
                    <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                      /p/{pod.slug}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pod.isDefault ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      Default Pod
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(pod.id)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 underline underline-offset-4"
                    >
                      Make default
                    </button>
                  )}
                </div>
              </div>

              {pod.description && (
                <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {pod.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                <span>
                  Embeddings:{" "}
                  <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                    {pod.allowEmbeddings ? "Enabled" : "Off"}
                  </strong>
                </span>
                <span>•</span>
                <span>Created {new Date(pod.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPod(pod)}
                  className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Settings
                </button>
                {!pod.isDefault && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingPod(pod);
                      setDeleteInput("");
                      setDeleteError(null);
                    }}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                  >
                    Delete
                  </button>
                )}
              </div>

              <Link
                href={`/p/${pod.slug}/memory`}
                className={buttonClass("secondary", "text-xs py-1.5 px-3")}
              >
                Open Memory →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Pod Modal */}
      {editingPod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Pod Settings: {editingPod.name}
            </h2>

            <form
              action={async (fd) => {
                const res = await updatePodAction(editingPod.id, null, fd);
                if (!res.error) {
                  setEditingPod(null);
                  router.refresh();
                }
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <Field
                label="Pod Name"
                name="name"
                defaultValue={editingPod.name}
                required
              />
              <Field
                label="Description"
                name="description"
                defaultValue={editingPod.description || ""}
              />
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editAllowEmbeddings"
                  name="allowEmbeddings"
                  value="true"
                  defaultChecked={editingPod.allowEmbeddings}
                  className="size-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-700"
                />
                <label
                  htmlFor="editAllowEmbeddings"
                  className="text-xs text-zinc-700 dark:text-zinc-300"
                >
                  Enable vector embeddings
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingPod(null)}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Saving...">Save Changes</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Pod Confirmation Modal */}
      {deletingPod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/60 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-red-600 dark:text-red-400">
              Delete Pod: {deletingPod.name}
            </h2>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This action will soft-delete this memory pod and{" "}
              <strong>immediately block all agent tokens connected to it</strong>.
              All entries, folders, and history within this pod will become inaccessible.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{deletingPod.slug}</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={deletingPod.slug}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              {deleteError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setDeletingPod(null)}
                className={buttonClass("secondary")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={
                  deleteInput.trim().toLowerCase() !==
                    deletingPod.slug.toLowerCase() || isDeleting
                }
                className={buttonClass("danger")}
              >
                {isDeleting ? "Deleting..." : "Delete Pod"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
