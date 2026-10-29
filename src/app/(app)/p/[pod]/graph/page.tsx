import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePod } from "@/lib/memory/pods";
import { listEntities, listPodRelations } from "@/lib/memory/graph";
import { GraphWorkspace } from "./graph-workspace";

export const metadata: Metadata = {
  title: "Knowledge Graph",
};

export default function GraphPage({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <div className="h-40 rounded-2xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-32 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-32 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      }
    >
      <GraphDataLoader params={params} />
    </Suspense>
  );
}

async function GraphDataLoader({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  const { pod: podSlug } = await params;
  const { pod } = await requirePod(podSlug);

  const [entities, initialRelations] = await Promise.all([
    listEntities(pod.id),
    listPodRelations(pod.id),
  ]);

  return (
    <GraphWorkspace
      pod={pod}
      entities={entities}
      initialRelations={initialRelations}
    />
  );
}
