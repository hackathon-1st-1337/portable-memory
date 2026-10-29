"use server";

import { revalidatePath } from "next/cache";
import { requirePod } from "@/lib/memory/pods";
import {
  runDreamCycle,
  acceptSuggestion,
  dismissSuggestion,
} from "@/lib/memory/dreaming";

export async function triggerDreamCycleAction(podSlug: string): Promise<{
  error?: string;
  runId?: string;
  stats?: Record<string, unknown>;
}> {
  const { pod } = await requirePod(podSlug);
  try {
    const run = await runDreamCycle(pod.id);
    revalidatePath(`/p/${podSlug}/dream`);
    revalidatePath(`/p/${podSlug}/memory`);
    revalidatePath(`/p/${podSlug}/graph`);
    return {
      runId: run.id,
      stats: run.stats as Record<string, unknown>,
    };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Dream cycle failed",
    };
  }
}

export async function acceptSuggestionAction(
  podSlug: string,
  suggestionId: string
): Promise<{ error?: string }> {
  const { user, pod } = await requirePod(podSlug);
  try {
    await acceptSuggestion(pod.id, suggestionId, user.id);
    revalidatePath(`/p/${podSlug}/dream`);
    revalidatePath(`/p/${podSlug}/memory`);
    revalidatePath(`/p/${podSlug}/graph`);
    return {};
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to accept suggestion",
    };
  }
}

export async function dismissSuggestionAction(
  podSlug: string,
  suggestionId: string
): Promise<{ error?: string }> {
  const { user, pod } = await requirePod(podSlug);
  try {
    await dismissSuggestion(pod.id, suggestionId, user.id);
    revalidatePath(`/p/${podSlug}/dream`);
    return {};
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to dismiss suggestion",
    };
  }
}
