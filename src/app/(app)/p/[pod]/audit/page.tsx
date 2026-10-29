import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePod } from "@/lib/memory/pods";
import { listAuditEvents } from "@/lib/memory/audit";
import { listPodAgents } from "@/lib/agents/agents";
import { listNamespaces } from "@/lib/memory/namespaces";
import { AuditWorkspace } from "./audit-workspace";

export const metadata: Metadata = {
  title: "Audit Log",
};

export default function AuditPage({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <div className="h-8 w-48 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="h-64 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
        </div>
      }
    >
      <AuditDataLoader params={params} />
    </Suspense>
  );
}

async function AuditDataLoader({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  const { pod: podSlug } = await params;
  const { pod } = await requirePod(podSlug);

  const [events, agents, namespaces] = await Promise.all([
    listAuditEvents(pod.id, { limit: 100 }),
    listPodAgents(pod.id),
    listNamespaces(pod.id),
  ]);

  return (
    <AuditWorkspace
      pod={pod}
      events={events}
      agents={agents}
      namespaces={namespaces}
    />
  );
}
