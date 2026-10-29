import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePod } from "@/lib/memory/pods";
import { listPodAgents } from "@/lib/agents/agents";
import { listNamespaces } from "@/lib/memory/namespaces";
import { AgentsWorkspace } from "./agents-workspace";

export const metadata: Metadata = {
  title: "Agents & Connections",
};

export default function AgentsPage({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <div className="h-8 w-48 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-44 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-44 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      }
    >
      <AgentsDataLoader params={params} />
    </Suspense>
  );
}

async function AgentsDataLoader({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  const { pod: podSlug } = await params;
  const { pod } = await requirePod(podSlug);

  const [agents, namespaces] = await Promise.all([
    listPodAgents(pod.id),
    listNamespaces(pod.id),
  ]);

  return <AgentsWorkspace pod={pod} agents={agents} namespaces={namespaces} />;
}
