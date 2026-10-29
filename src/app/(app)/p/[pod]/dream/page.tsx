import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePod } from "@/lib/memory/pods";
import { listDreamRuns, listSuggestions } from "@/lib/memory/dreaming";
import { DreamWorkspace } from "./dream-workspace";

export const metadata: Metadata = {
  title: "Dreaming & Consolidation",
};

export default function DreamPage({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <div className="h-40 rounded-2xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="grid grid-cols-4 gap-4">
            <div className="h-24 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-24 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-24 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-24 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      }
    >
      <DreamDataLoader params={params} />
    </Suspense>
  );
}

async function DreamDataLoader({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  const { pod: podSlug } = await params;
  const { pod } = await requirePod(podSlug);

  const [runs, suggestions] = await Promise.all([
    listDreamRuns(pod.id),
    listSuggestions(pod.id),
  ]);

  return <DreamWorkspace pod={pod} runs={runs} suggestions={suggestions} />;
}
