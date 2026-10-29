"use server";

import { revalidatePath } from "next/cache";
import { requirePod } from "@/lib/memory/pods";
import {
  createNamespace,
  updateNamespace,
  moveNamespace,
  softDeleteNamespace,
} from "@/lib/memory/namespaces";
import {
  createEntry,
  updateEntry,
  deleteEntry,
  restoreEntryVersion,
  getEntryVersions,
} from "@/lib/memory/entries";
import { searchMemory, type SearchResult } from "@/lib/memory/search";
import { approveDraft, rejectDraft } from "@/lib/memory/procedures";

export interface MemoryFormState {
  error?: string;
  success?: string;
}

// ---------------------------------------------------------------------------
// Namespaces Actions
// ---------------------------------------------------------------------------

export async function createNamespaceAction(
  podSlug: string,
  prevState: MemoryFormState | null,
  formData: FormData
): Promise<MemoryFormState> {
  const { pod } = await requirePod(podSlug);
  const name = formData.get("name")?.toString().trim();
  const parentId = formData.get("parentId")?.toString().trim() || null;
  const description = formData.get("description")?.toString().trim();
  const defaultVisibility =
    (formData.get("defaultVisibility")?.toString() as "private" | "shared" | "public") || "shared";
  const agentsCanCreate = formData.get("agentsCanCreate") !== "false";
  const grantAgentIds = formData.getAll("grantAgentIds").map(String);

  if (!name) return { error: "Folder name is required" };

  try {
    await createNamespace(pod.id, {
      name,
      parentId,
      description,
      defaultVisibility,
      agentsCanCreate,
      grantAgentIds,
    });
    revalidatePath(`/p/${podSlug}/memory`);
    return { success: "Folder created successfully" };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to create folder" };
  }
}

export async function updateNamespaceAction(
  podSlug: string,
  namespaceId: string,
  prevState: MemoryFormState | null,
  formData: FormData
): Promise<MemoryFormState> {
  const { pod } = await requirePod(podSlug);
  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const defaultVisibility =
    (formData.get("defaultVisibility")?.toString() as "private" | "shared" | "public") || undefined;
  const agentsCanCreate = formData.has("agentsCanCreate")
    ? formData.get("agentsCanCreate") === "true"
    : undefined;

  try {
    await updateNamespace(pod.id, namespaceId, {
      name,
      description,
      defaultVisibility,
      agentsCanCreate,
    });
    revalidatePath(`/p/${podSlug}/memory`);
    return { success: "Folder updated successfully" };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update folder" };
  }
}

export async function moveNamespaceAction(
  podSlug: string,
  namespaceId: string,
  newParentId: string | null
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await moveNamespace(pod.id, namespaceId, newParentId);
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to move folder" };
  }
}

export async function deleteNamespaceAction(
  podSlug: string,
  namespaceId: string,
  moveEntriesToNamespaceId?: string | null
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await softDeleteNamespace(pod.id, namespaceId, moveEntriesToNamespaceId);
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to delete folder" };
  }
}

// ---------------------------------------------------------------------------
// Entries Actions
// ---------------------------------------------------------------------------

export async function createEntryAction(
  podSlug: string,
  prevState: MemoryFormState | null,
  formData: FormData
): Promise<MemoryFormState> {
  const { user, pod } = await requirePod(podSlug);
  const namespaceId = formData.get("namespaceId")?.toString().trim();
  const key = formData.get("key")?.toString().trim();
  const rawValue = formData.get("value")?.toString().trim();
  const visibility =
    (formData.get("visibility")?.toString() as "private" | "shared" | "public") || "shared";
  const pinned = formData.get("pinned") === "true";
  const rawKind = formData.get("kind")?.toString().trim();
  const kind = (rawKind === "procedure" || rawKind === "event") ? rawKind : "fact";
  const procedureWhen = formData.get("procedureWhen")?.toString().trim() || undefined;

  if (!namespaceId || !key || rawValue === undefined) {
    return { error: "Folder, key, and value are required" };
  }

  // Parse value (JSON if valid JSON, otherwise string)
  let parsedValue: unknown = rawValue;
  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    // Keep as plain text string
    parsedValue = rawValue;
  }

  try {
    await createEntry({
      podId: pod.id,
      namespaceId,
      key,
      value: parsedValue,
      visibility,
      pinned,
      kind,
      procedureWhen,
      createdByUser: true,
    });
    revalidatePath(`/p/${podSlug}/memory`);
    return { success: "Memory entry created" };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to create entry" };
  }
}

export async function updateEntryAction(
  podSlug: string,
  entryId: string,
  expectedVersion: number,
  prevState: MemoryFormState | null,
  formData: FormData
): Promise<MemoryFormState> {
  const { pod } = await requirePod(podSlug);
  const rawValue = formData.get("value")?.toString();
  const visibility =
    (formData.get("visibility")?.toString() as "private" | "shared" | "public") || undefined;
  const pinned = formData.has("pinned") ? formData.get("pinned") === "true" : undefined;
  const rawKind = formData.get("kind")?.toString().trim();
  const kind = rawKind === "procedure" || rawKind === "event" || rawKind === "fact" ? rawKind : undefined;
  const procedureWhen = formData.has("procedureWhen")
    ? formData.get("procedureWhen")?.toString().trim() || null
    : undefined;

  let parsedValue: unknown = undefined;
  if (rawValue !== undefined) {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch {
      parsedValue = rawValue;
    }
  }

  try {
    await updateEntry({
      podId: pod.id,
      entryId,
      value: parsedValue,
      visibility,
      pinned,
      kind,
      procedureWhen: procedureWhen ?? undefined,
      expectedVersion,
      changedByUser: true,
    });
    revalidatePath(`/p/${podSlug}/memory`);
    return { success: "Memory entry updated" };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update entry" };
  }
}

export async function approveDraftAction(
  podSlug: string,
  entryId: string
): Promise<{ error?: string }> {
  const { user, pod } = await requirePod(podSlug);
  try {
    await approveDraft(pod.id, entryId, user.id);
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to approve draft" };
  }
}

export async function rejectDraftAction(
  podSlug: string,
  entryId: string
): Promise<{ error?: string }> {
  const { user, pod } = await requirePod(podSlug);
  try {
    await rejectDraft(pod.id, entryId, user.id);
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to reject draft" };
  }
}

export async function toggleFolderRequireApprovalAction(
  podSlug: string,
  namespaceId: string,
  requireApproval: boolean
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await updateNamespace(pod.id, namespaceId, { requireApproval });
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update folder settings" };
  }
}

export async function togglePinAction(
  podSlug: string,
  entryId: string,
  currentPinned: boolean
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await updateEntry({
      podId: pod.id,
      entryId,
      pinned: !currentPinned,
      changedByUser: true,
    });
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to toggle pin" };
  }
}

export async function toggleVisibilityAction(
  podSlug: string,
  entryId: string,
  newVisibility: "private" | "shared" | "public"
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await updateEntry({
      podId: pod.id,
      entryId,
      visibility: newVisibility,
      changedByUser: true,
    });
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update visibility" };
  }
}

export async function deleteEntryAction(
  podSlug: string,
  entryId: string
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await deleteEntry(pod.id, entryId, { actorType: "user" });
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to delete entry" };
  }
}

export async function fetchEntryVersionsAction(podSlug: string, entryId: string) {
  const { pod } = await requirePod(podSlug);
  return getEntryVersions(pod.id, entryId);
}

export async function restoreEntryVersionAction(
  podSlug: string,
  entryId: string,
  targetVersion: number
): Promise<{ error?: string }> {
  const { user, pod } = await requirePod(podSlug);
  try {
    await restoreEntryVersion(pod.id, entryId, targetVersion, user.id);
    revalidatePath(`/p/${podSlug}/memory`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to restore version" };
  }
}

export async function searchMemoryAction(
  podSlug: string,
  query: string
): Promise<SearchResult[]> {
  const { pod } = await requirePod(podSlug);
  return searchMemory(pod.id, query);
}
