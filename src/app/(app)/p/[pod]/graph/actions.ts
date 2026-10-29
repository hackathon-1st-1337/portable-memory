"use server";

import { requirePod } from "@/lib/memory/pods";
import { exploreMemory, type ExploredGraph } from "@/lib/memory/graph";

export async function exploreGraphAction(
  podSlug: string,
  entityQuery: string,
  depth = 1
): Promise<{
  error?: string;
  graph?: ExploredGraph | null;
}> {
  const { pod } = await requirePod(podSlug);
  try {
    const graph = await exploreMemory(pod.id, entityQuery, depth);
    return { graph };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to explore graph",
    };
  }
}
