import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePod } from "@/lib/memory/pods";
import { listNamespaces } from "@/lib/memory/namespaces";
import { listEntries } from "@/lib/memory/entries";
import { listPodAgents } from "@/lib/agents/agents";
import { listPendingDrafts } from "@/lib/memory/procedures";
import { MemoryWorkspace } from "./memory-workspace";

export const metadata: Metadata = {
  title: "Memory",
};

export default function MemoryPage({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <div className="h-8 w-48 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-4 h-96 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="col-span-8 h-96 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      }
    >
      <MemoryDataLoader params={params} />
    </Suspense>
  );
}

async function MemoryDataLoader({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  const { pod: podSlug } = await params;
  const { pod } = await requirePod(podSlug);

  const [namespaces, entries, agents, pendingDrafts] = await Promise.all([
    listNamespaces(pod.id),
    listEntries(pod.id, { includePrivate: true }),
    listPodAgents(pod.id),
    listPendingDrafts(pod.id),
  ]);

  return (
    <MemoryWorkspace
      pod={pod}
      namespaces={namespaces}
      entries={entries}
      agents={agents}
      pendingDrafts={pendingDrafts}
    />
  );
}
