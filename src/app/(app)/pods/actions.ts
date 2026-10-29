"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  createPod,
  updatePod,
  setDefaultPod,
  softDeletePod,
  getPodBySlug,
} from "@/lib/memory/pods";

export interface PodFormState {
  error?: string;
  success?: string;
}

export async function createPodAction(
  prevState: PodFormState | null,
  formData: FormData
): Promise<PodFormState> {
  const user = await requireUser();
  const name = formData.get("name")?.toString().trim();
  const slug = formData.get("slug")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const allowEmbeddings = formData.get("allowEmbeddings") === "true";

  if (!name || !slug) {
    return { error: "Pod name and slug are required" };
  }

  try {
    const existing = await getPodBySlug(user.id, slug);
    if (existing) {
      return { error: `A pod with slug '${slug}' already exists` };
    }

    const newPod = await createPod(user.id, {
      name,
      slug,
      description,
      allowEmbeddings,
    });

    revalidatePath("/pods");
    revalidatePath(`/p/${newPod.slug}/memory`);
    redirect(`/p/${newPod.slug}/memory`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create pod";
    return { error: message };
  }
}

export async function updatePodAction(
  podId: string,
  prevState: PodFormState | null,
  formData: FormData
): Promise<PodFormState> {
  const user = await requireUser();
  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const allowEmbeddings = formData.get("allowEmbeddings") === "true";

  if (!name) {
    return { error: "Pod name cannot be empty" };
  }

  try {
    await updatePod(user.id, podId, {
      name,
      description,
      allowEmbeddings,
    });
    revalidatePath("/pods");
    return { success: "Pod updated successfully" };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update pod" };
  }
}

export async function setDefaultPodAction(podId: string): Promise<void> {
  const user = await requireUser();
  await setDefaultPod(user.id, podId);
  revalidatePath("/pods");
  revalidatePath("/dashboard");
}

export async function deletePodAction(
  podId: string,
  typedConfirmation: string,
  expectedSlug: string
): Promise<{ error?: string }> {
  if (typedConfirmation.trim().toLowerCase() !== expectedSlug.toLowerCase()) {
    return { error: `Confirmation does not match pod slug '${expectedSlug}'` };
  }

  const user = await requireUser();
  try {
    await softDeletePod(user.id, podId);
    revalidatePath("/pods");
    revalidatePath("/dashboard");
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to delete pod" };
  }
}
